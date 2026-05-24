// Configura worker do PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Estado do App
        const state = {
            files: [], // { name: string, status: 'loading' | 'success' | 'error' }
            domains: {}, // { 'domain.com': { count: 1, source: 'file.pdf', manual: false, isWhitelisted: false, whitelistReason: '' } }
            invalidDomains: [], // Auditoria temporária: { id, text, reason, source, line }
            invalidSearchQuery: '',
            whitelist: new Set([]),
            searchQuery: '',
            activeTab: 'blocklist', // 'blocklist' | 'whitelist' | 'invalid' | 'compare'
            pagination: {
                blocklist: { currentPage: 1, pageSize: 100 },
                whitelist: { currentPage: 1, pageSize: 100 },
                invalid: { currentPage: 1, pageSize: 100 }
            },
            rules: {
                ignoreIps: true,
                skipEmails: true,
                whitelistGov: true,
                whitelistAnatel: true,
                removeWww: false  // false = preserva www. por padrão
            },
            compare: {
                fileA: { name: '', text: '', domains: new Set(), inputType: '' },
                fileB: { name: '', text: '', domains: new Set(), inputType: '' },
                results: [], // Array de domínios inéditos
                whitelistExcluded: [], // Inéditos da lista B ignorados por whitelist
                duplicatedInA: 0,
                searchQuery: '',
                pagination: { currentPage: 1, pageSize: 100 }
            }
        };

        const STORAGE_DIRECTORIES = {
            exports: 'exports',
            audits: 'audits',
            fixtures: 'fixtures',
            knowledgeBase: 'knowledge-base'
        };

        const EXPORT_PROFILES = {
            blocklist: { prefix: 'resultado', extension: 'txt', mimeType: 'text/plain;charset=utf-8' },
            whitelist: { prefix: 'whitelist-final', extension: 'txt', mimeType: 'text/plain;charset=utf-8' },
            compareResult: { prefix: 'arquivo_master', extension: 'txt', mimeType: 'text/plain;charset=utf-8' },
            compareAudit: { prefix: 'arquivo_master_auditoria', extension: 'json', mimeType: 'application/json;charset=utf-8' }
        };

        let invalidAuditSequence = 0;

        // Elementos DOM
        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('fileInput');
        const fileList = document.getElementById('fileList');
        const whitelistInput = document.getElementById('whitelistInput');
        const btnAddWhitelist = document.getElementById('btnAddWhitelist');
        const whitelistChips = document.getElementById('whitelistChips');
        const searchBar = document.getElementById('searchBar');
        const domainTableBody = document.getElementById('domainTableBody');
        const btnExport = document.getElementById('btnExport');
        const btnExportWhitelist = document.getElementById('btnExportWhitelist');
        const btnClearAll = document.getElementById('btnClearAll');
        const btnAddDomain = document.getElementById('btnAddDomain');
        const invalidSearchBar = document.getElementById('invalidSearchBar');
        const invalidTableBody = document.getElementById('invalidTableBody');
        const invalidPaginationContainer = document.getElementById('invalidPaginationContainer');
        const invalidTotalCount = document.getElementById('invalidTotalCount');

        // Elementos DOM Comparador
        const dropzoneA = document.getElementById('dropzoneA');
        const dropzoneB = document.getElementById('dropzoneB');
        const fileInputA = document.getElementById('fileInputA');
        const fileInputB = document.getElementById('fileInputB');
        const labelFileA = document.getElementById('labelFileA');
        const labelFileB = document.getElementById('labelFileB');
        const statusFileA = document.getElementById('statusFileA');
        const statusFileB = document.getElementById('statusFileB');
        const statCompareA = document.getElementById('statCompareA');
        const statCompareB = document.getElementById('statCompareB');
        const statCompareDuplicated = document.getElementById('statCompareDuplicated');
        const statCompareNew = document.getElementById('statCompareNew');
        const compareSearchBar = document.getElementById('compareSearchBar');
        const btnCompareClear = document.getElementById('btnCompareClear');
        const btnCompareExport = document.getElementById('btnCompareExport');
        const compareTableBody = document.getElementById('compareTableBody');
        const comparePaginationContainer = document.getElementById('comparePaginationContainer');

        // Checkboxes de Regras
        const optOnlyDomains = document.getElementById('optOnlyDomains');
        const optSkipEmails = document.getElementById('optSkipEmails');
        const optWhitelistGov = document.getElementById('optWhitelistGov');
        const optWhitelistAnatel = document.getElementById('optWhitelistAnatel');
        const optRemoveWww = document.getElementById('optRemoveWww');

        // Debounce: evita reprocessamento excessivo ao alternar regras rapidamente
        let _reprocessTimer = null;
        function reprocessDebounced() {
            clearTimeout(_reprocessTimer);
            _reprocessTimer = setTimeout(reprocessAllExtractedText, 150);
        }

        // Elementos de Estatísticas
        const statFiles = document.getElementById('statFiles');
        const statTotalDomains = document.getElementById('statTotalDomains');
        const statFiltered = document.getElementById('statFiltered');
        const statExportCount = document.getElementById('statExportCount');

        function padNumber(value) {
            return String(value).padStart(2, '0');
        }

        function buildTimestampLabel(date = new Date()) {
            return [
                date.getFullYear(),
                padNumber(date.getMonth() + 1),
                padNumber(date.getDate())
            ].join('') + '-' + [
                padNumber(date.getHours()),
                padNumber(date.getMinutes()),
                padNumber(date.getSeconds())
            ].join('');
        }

        function sanitizeFileStem(value) {
            return String(value || '')
                .trim()
                .toLowerCase()
                .replace(/\.[a-z0-9]+$/i, '')
                .replace(/[^a-z0-9._-]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 40);
        }

        function buildSuggestedFilename(profileKey, parts = []) {
            const profile = EXPORT_PROFILES[profileKey];
            const segments = [profile.prefix, ...parts.filter(Boolean)];
            return `${segments.join('-')}.${profile.extension}`;
        }

        function triggerDownload(content, fileName, mimeType) {
            const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }

        function detectCompareInputType(fileName = '') {
            const lowerName = fileName.toLowerCase();
            if (lowerName.endsWith('.pdf')) return 'pdf';
            if (lowerName.endsWith('.txt')) return 'txt';
            return 'desconhecido';
        }

        function getSortedBlocklistDomains() {
            return Object.keys(state.domains)
                .filter(domain => !state.domains[domain].isWhitelisted)
                .sort();
        }

        function getSortedWhitelistDomains() {
            return Object.keys(state.domains)
                .filter(domain => state.domains[domain].isWhitelisted)
                .sort();
        }

        function getPrimarySourceLabel() {
            const successfulFiles = state.files
                .filter(file => file.status === 'success' && file.name)
                .map(file => sanitizeFileStem(file.name))
                .filter(Boolean);

            if (successfulFiles.length === 0) return 'manual';
            if (successfulFiles.length === 1) return successfulFiles[0];
            return `multiplos-arquivos-${successfulFiles.length}`;
        }

        function buildCompareDiffSnapshot() {
            const setA = state.compare.fileA.domains || new Set();
            const setB = state.compare.fileB.domains || new Set();
            const onlyInB = Array.from(setB).filter(domain => !setA.has(domain)).sort();
            const onlyInA = Array.from(setA).filter(domain => !setB.has(domain)).sort();

            return {
                onlyInA,
                onlyInB
            };
        }

        function buildCompareAuditReport({ exportedAt, resultFileName, auditFileName }) {
            const diffSnapshot = buildCompareDiffSnapshot();
            return {
                generatedAt: exportedAt.toISOString(),
                directories: {
                    finalResult: STORAGE_DIRECTORIES.exports,
                    auditReport: STORAGE_DIRECTORIES.audits,
                    fixtures: STORAGE_DIRECTORIES.fixtures,
                    knowledgeBase: STORAGE_DIRECTORIES.knowledgeBase
                },
                files: {
                    listA: {
                        name: state.compare.fileA.name || '',
                        inputType: state.compare.fileA.inputType || detectCompareInputType(state.compare.fileA.name),
                        uniqueDomains: (state.compare.fileA.domains || new Set()).size
                    },
                    listB: {
                        name: state.compare.fileB.name || '',
                        inputType: state.compare.fileB.inputType || detectCompareInputType(state.compare.fileB.name),
                        uniqueDomains: (state.compare.fileB.domains || new Set()).size
                    }
                },
                outputs: {
                    resultFileName,
                    auditFileName
                },
                rules: {
                    ignoreIps: state.rules.ignoreIps,
                    skipEmails: state.rules.skipEmails,
                    whitelistGov: state.rules.whitelistGov,
                    whitelistAnatel: state.rules.whitelistAnatel,
                    removeWww: state.rules.removeWww
                },
                counts: {
                    uniqueInA: (state.compare.fileA.domains || new Set()).size,
                    uniqueInB: (state.compare.fileB.domains || new Set()).size,
                    duplicatedInA: state.compare.duplicatedInA || 0,
                    onlyInA: diffSnapshot.onlyInA.length,
                    onlyInB: diffSnapshot.onlyInB.length,
                    whitelistExcluded: (state.compare.whitelistExcluded || []).length,
                    finalNewDomains: (state.compare.results || []).length
                },
                compare: {
                    onlyInA: diffSnapshot.onlyInA,
                    onlyInB: diffSnapshot.onlyInB,
                    whitelistExcluded: [...(state.compare.whitelistExcluded || [])],
                    finalNewDomains: [...(state.compare.results || [])]
                }
            };
        }

        // Inicialização
        function init() {
            renderWhitelist();
            renderTable();
            renderInvalidTable();
            updateStats();
            setupEventListeners();
        }

        // Setup dos Event Listeners
        function setupEventListeners() {
            // Drag and Drop
            dropzone.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', handleFileSelect);
            
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            });

            dropzone.addEventListener('dragleave', () => {
                dropzone.classList.remove('dragover');
            });

            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) {
                    processFiles(e.dataTransfer.files);
                }
            });

            // Painel Expansível de Regras
            const rulesPanelHeader = document.getElementById('rulesPanelHeader');
            const rulesPanelContent = document.getElementById('rulesPanelContent');
            if (rulesPanelHeader && rulesPanelContent) {
                rulesPanelHeader.addEventListener('click', () => {
                    const isCollapsed = rulesPanelContent.classList.toggle('collapsed');
                    rulesPanelHeader.classList.toggle('collapsed', isCollapsed);
                });
            }

            // Regras / Opções — usam debounce para evitar reprocessamento em cascata
            optOnlyDomains.addEventListener('change', (e) => {
                state.rules.ignoreIps = e.target.checked;
                reprocessDebounced();
            });
            optSkipEmails.addEventListener('change', (e) => {
                state.rules.skipEmails = e.target.checked;
                reprocessDebounced();
            });
            optWhitelistGov.addEventListener('change', (e) => {
                state.rules.whitelistGov = e.target.checked;
                reprocessDebounced();
                refreshComparisonIfReady();
            });
            optWhitelistAnatel.addEventListener('change', (e) => {
                state.rules.whitelistAnatel = e.target.checked;
                reprocessDebounced();
                refreshComparisonIfReady();
            });
            optRemoveWww.addEventListener('change', (e) => {
                state.rules.removeWww = e.target.checked;
                reprocessDebounced();
            });

            // Whitelist
            btnAddWhitelist.addEventListener('click', addWhitelistFromInput);
            whitelistInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') addWhitelistFromInput();
            });

            // Busca
            searchBar.addEventListener('input', (e) => {
                state.searchQuery = e.target.value.toLowerCase().trim();
                resetPagination();
                renderTable();
            });

            if (invalidSearchBar) {
                invalidSearchBar.addEventListener('input', (e) => {
                    state.invalidSearchQuery = e.target.value.toLowerCase().trim();
                    state.pagination.invalid.currentPage = 1;
                    renderInvalidTable();
                });
            }

            // Botões de Ações Gerais
            btnClearAll.addEventListener('click', clearAll);
            btnExport.addEventListener('click', exportBlocklist);
            btnExportWhitelist.addEventListener('click', exportWhitelist);
            btnAddDomain.addEventListener('click', addManualDomainPrompt);

            // Event Listeners do Comparador
            if (dropzoneA && fileInputA && dropzoneB && fileInputB) {
                dropzoneA.addEventListener('click', () => fileInputA.click());
                fileInputA.addEventListener('change', (e) => handleCompareFileSelect(e, 'A'));
                
                dropzoneA.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropzoneA.classList.add('dragover');
                });
                dropzoneA.addEventListener('dragleave', () => dropzoneA.classList.remove('dragover'));
                dropzoneA.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropzoneA.classList.remove('dragover');
                    if (e.dataTransfer.files.length > 0) {
                        processCompareFile(e.dataTransfer.files[0], 'A');
                    }
                });

                dropzoneB.addEventListener('click', () => fileInputB.click());
                fileInputB.addEventListener('change', (e) => handleCompareFileSelect(e, 'B'));
                
                dropzoneB.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropzoneB.classList.add('dragover');
                });
                dropzoneB.addEventListener('dragleave', () => dropzoneB.classList.remove('dragover'));
                dropzoneB.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropzoneB.classList.remove('dragover');
                    if (e.dataTransfer.files.length > 0) {
                        processCompareFile(e.dataTransfer.files[0], 'B');
                    }
                });
            }

            if (compareSearchBar) {
                compareSearchBar.addEventListener('input', (e) => {
                    state.compare.searchQuery = e.target.value.toLowerCase().trim();
                    state.compare.pagination.currentPage = 1;
                    renderCompareTable();
                });
            }

            if (btnCompareClear) {
                btnCompareClear.addEventListener('click', clearCompare);
            }

            if (btnCompareExport) {
                btnCompareExport.addEventListener('click', exportCompareResults);
            }
        }

        // Obtém o motivo de inclusão na whitelist (ou null caso não esteja na whitelist)
        function getWhitelistReason(domain) {
            // Normaliza o domínio apenas para a comparação com a whitelist
            // Remove apenas protocolo — preserva www. e subdomínios
            let cleanDomain = domain.trim().toLowerCase();
            cleanDomain = cleanDomain.replace(/^https?:\/\//, '');
            cleanDomain = cleanDomain.split(/[\/\?#:]/)[0];

            // 1. Verificação manual: primeiro testa o domínio exato, depois sem www.
            if (state.whitelist.has(cleanDomain)) return 'Manual';
            // Também testa sem www. para capturar entradas de whitelist sem prefixo
            const withoutWww = cleanDomain.startsWith('www.')
                ? cleanDomain.substring(4)
                : cleanDomain;
            if (withoutWww !== cleanDomain && state.whitelist.has(withoutWww)) return 'Manual';
            
            const parts = cleanDomain.split('.');
            if (parts.length > 2) {
                const parentDomain = parts.slice(-2).join('.');
                if (state.whitelist.has(parentDomain)) return 'Manual';
            }
            if (parts.length > 3) {
                const parentDomain = parts.slice(-3).join('.');
                if (state.whitelist.has(parentDomain)) return 'Manual';
            }

            const hasComBr = cleanDomain.includes('.com.br');

            if (!hasComBr) {
                const criticalReason = DomainExtractionEngine.getAutoWhitelistReason(cleanDomain, state.rules);
                if (criticalReason) return criticalReason;
            } else {
                const criticalReason = DomainExtractionEngine.getAutoWhitelistReason(cleanDomain, state.rules);
                if (criticalReason) return criticalReason;
            }

            return null;
        }

        // Verifica se o domínio está na whitelist (retorna booleano)
        function isWhitelisted(domain) {
            return getWhitelistReason(domain) !== null;
        }

        // Atualiza cache O(1) da whitelist de um domínio
        function updateDomainWhitelistStatus(domainName) {
            const item = state.domains[domainName];
            if (!item) return;
            
            const reason = getWhitelistReason(domainName);
            item.isWhitelisted = (reason !== null);
            item.whitelistReason = reason || '';
        }

        // Atualiza cache O(1) da whitelist de todos os domínios
        function updateAllDomainsWhitelistStatus() {
            for (const domain in state.domains) {
                updateDomainWhitelistStatus(domain);
            }
        }

        function refreshComparisonIfReady() {
            const setA = state.compare.fileA.domains || new Set();
            const setB = state.compare.fileB.domains || new Set();
            if (setA.size > 0 || setB.size > 0) {
                runComparison();
            }
        }

        // Reseta o estado da paginação
        function resetPagination() {
            state.pagination.blocklist.currentPage = 1;
            state.pagination.whitelist.currentPage = 1;
            state.pagination.invalid.currentPage = 1;
        }

        function escapeHtml(value) {
            return String(value ?? '').replace(/[&<>'"]/g, char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[char]));
        }

        function addInvalidAuditEntry({ text, reason, source, line }) {
            state.invalidDomains.push({
                id: ++invalidAuditSequence,
                text: String(text ?? ''),
                reason: reason || 'Motivo não informado',
                source: source || 'Origem desconhecida',
                line: line || ''
            });
        }

        // Adiciona um domínio de exceção a partir do input
        function addWhitelistFromInput() {
            const val = whitelistInput.value.trim().toLowerCase();
            if (!val) return;
            
            // Validação simples de domínio/IP
            if (isValidDomainName(val)) {
                state.whitelist.add(val);
                whitelistInput.value = '';
                renderWhitelist();
                updateAllDomainsWhitelistStatus();
                resetPagination();
                renderTable();
                refreshComparisonIfReady();
                updateStats();
            } else {
                alert('Por favor, digite um domínio ou IP válido (Exemplo: malware.com ou 192.168.1.100)');
            }
        }

        // Renderiza Chips da Whitelist
        function renderWhitelist() {
            whitelistChips.innerHTML = '';
            Array.from(state.whitelist).sort().forEach(item => {
                const chip = document.createElement('span');
                chip.className = 'chip';
                chip.innerHTML = `
                    ${item}
                    <button class="chip-remove" onclick="removeWhitelistItem('${item}')">&times;</button>
                `;
                whitelistChips.appendChild(chip);
            });
        }

        // Remove item da whitelist
        window.removeWhitelistItem = function(item) {
            state.whitelist.delete(item);
            renderWhitelist();
            updateAllDomainsWhitelistStatus();
            resetPagination();
            renderTable();
            refreshComparisonIfReady();
            updateStats();
        };

        // Handler de Seleção de Arquivos
        function handleFileSelect(e) {
            if (e.target.files.length > 0) {
                processFiles(e.target.files);
            }
        }

        // Processa a pilha de arquivos
        function processFiles(fileListObject) {
            const filesArray = Array.from(fileListObject);
            filesArray.forEach(file => {
                const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                const isTxt = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');

                if (!isPdf && !isTxt) {
                    alert(`O arquivo "${file.name}" não é um PDF ou TXT válido.`);
                    return;
                }
                
                // Evita processar o mesmo arquivo duas vezes se já estiver na lista
                if (state.files.some(f => f.name === file.name)) {
                    return;
                }

                const fileObj = {
                    name: file.name,
                    status: 'loading',
                    statusMessage: 'Lendo...',
                    rawText: '', // Salvaremos o texto bruto para permitir re-processamento com regras diferentes
                    auditEvents: []
                };
                
                state.files.push(fileObj);
                renderFileList();
                updateStats();

                // Ler o arquivo
                const reader = new FileReader();
                reader.onload = async function() {
                    try {
                        let text = '';
                        if (isPdf) {
                            const typedArray = new Uint8Array(this.result);
                            text = await extractTextFromPdf(typedArray, file.name, (progMsg) => {
                                fileObj.statusMessage = progMsg;
                                renderFileList();
                            });
                        } else if (isTxt) {
                            text = this.result;
                        }
                        
                        fileObj.rawText = text;
                        fileObj.status = 'success';
                        fileObj.statusMessage = '';
                        
                        // Executa extração de domínios sobre o texto
                        extractDomainsFromText(text, file.name);
                        
                        renderFileList();
                        renderTable();
                        renderInvalidTable();
                        updateStats();
                    } catch (err) {
                        console.error(err);
                        fileObj.status = 'error';
                        fileObj.statusMessage = 'Erro de leitura';
                        renderFileList();
                    }
                };
                reader.onerror = function() {
                    fileObj.status = 'error';
                    fileObj.statusMessage = 'Erro de leitura';
                    renderFileList();
                };

                if (isPdf) {
                    reader.readAsArrayBuffer(file);
                } else if (isTxt) {
                    reader.readAsText(file, 'utf-8');
                }
            });
        }

        // Renderiza lista de arquivos na lateral
        function renderFileList() {
            fileList.innerHTML = '';
            if (state.files.length === 0) {
                fileList.innerHTML = '<p style="font-size:0.75rem; color:var(--text-muted); text-align:center; padding:1rem 0;">Nenhum arquivo carregado</p>';
                return;
            }

            state.files.forEach((file, index) => {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.style.flexDirection = 'column';
                item.style.alignItems = 'stretch';
                item.style.gap = '0.5rem';
                
                let statusLabel = '';
                if (file.status === 'loading') {
                    const msg = file.statusMessage || 'Lendo...';
                    statusLabel = `<span class="file-status status-loading" title="${msg}">${msg}</span>`;
                } else if (file.status === 'success') {
                    statusLabel = '<span class="file-status status-success">Sucesso</span>';
                } else {
                    statusLabel = '<span class="file-status status-error">Erro</span>';
                }

                const isFilePdf = file.name.toLowerCase().endsWith('.pdf');
                const iconColor = isFilePdf ? 'var(--accent-rose)' : 'var(--accent-cyan)';

                let statsHtml = '';
                if (file.status === 'success' && file.stats) {
                    statsHtml = `
                        <div style="font-size: 0.65rem; color: var(--text-muted); padding-left: 1.25rem; border-top: 1px solid rgba(255, 255, 255, 0.04); padding-top: 0.35rem; display: flex; flex-direction: column; gap: 0.15rem;">
                            <div>Linhas: <b>${file.stats.totalLines}</b> | Vazias: ${file.stats.emptyLines}</div>
                            <div>Inválidas: ${file.stats.invalidLines} | Duplicadas: ${file.stats.duplicates}</div>
                        </div>
                    `;
                }

                item.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                        <div class="file-info" title="${file.name}">
                            <!-- Document small icon -->
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" style="flex-shrink:0; color:${iconColor};"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                            <span class="file-name">${file.name}</span>
                            ${statusLabel}
                        </div>
                        <button class="file-remove" onclick="removeFile(${index})">&times;</button>
                    </div>
                    ${statsHtml}
                `;
                fileList.appendChild(item);
            });
        }

        // Remove um arquivo processado e recalcula os domínios
        window.removeFile = function(index) {
            state.files.splice(index, 1);
            fileInput.value = ''; // Limpa o input de arquivo (corrige bug visual e de reupload)
            reprocessAllExtractedText();
        };

        // Extrai texto bruto de um PDF usando PDF.js e OCR com Tesseract.js para imagens
        async function extractTextFromPdf(typedArray, filename, progressCallback) {
            const loadingTask = pdfjsLib.getDocument({ data: typedArray });
            const pdf = await loadingTask.promise;
            let fullText = '';
            let ocrWorkerInstance = null;
            
            for (let i = 1; i <= pdf.numPages; i++) {
                if (progressCallback) {
                    progressCallback(`Pág ${i}/${pdf.numPages}...`);
                }
                
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                let pageText = textContent.items.map(item => item.str).join(' ');
                
                // OCR Inteligente: Executa se o texto nativo for muito curto (indicativo de imagem escaneada)
                if (pageText.trim().length < 15) {
                    if (progressCallback) {
                        progressCallback(`OCR Pág ${i}/${pdf.numPages}...`);
                    }
                    try {
                        if (!ocrWorkerInstance) {
                            ocrWorkerInstance = await Tesseract.createWorker('eng');
                        }
                        
                        // Renderizar página no canvas com escala de 2x para melhor precisão do OCR
                        const viewport = page.getViewport({ scale: 2.0 });
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        
                        await page.render({ canvasContext: context, viewport: viewport }).promise;
                        
                        // Executar reconhecimento via Tesseract
                        const { data: { text } } = await ocrWorkerInstance.recognize(canvas);
                        pageText = text;
                        console.log(`Página ${i}: OCR Concluído. Caracteres extraídos: ${pageText.length}`);
                    } catch (ocrErr) {
                        console.error(`Erro ao executar OCR na página ${i} do arquivo ${filename}:`, ocrErr);
                        const auditEvent = {
                            text: `Página ${i} sem texto OCR recuperável`,
                            reason: 'Falha OCR',
                            source: filename,
                            line: `pág. ${i}`
                        };
                        const auditFile = state.files.find(f => f.name === filename);
                        if (auditFile) {
                            auditFile.auditEvents = auditFile.auditEvents || [];
                            auditFile.auditEvents.push(auditEvent);
                        }
                        addInvalidAuditEntry(auditEvent);
                    }
                } else {
                    console.log(`Página ${i}: Texto nativo extraído. Caracteres: ${pageText.length}`);
                }
                
                fullText += pageText + '\n';
            }
            
            if (ocrWorkerInstance) {
                await ocrWorkerInstance.terminate();
            }
            
            return fullText;
        }

        // Reprocessa todo o texto já extraído caso as opções de limpeza mudem
        function reprocessAllExtractedText() {
            // Guarda domínios manuais
            const manualDomains = {};
            for (const d in state.domains) {
                if (state.domains[d].manual) {
                    manualDomains[d] = state.domains[d];
                }
            }

            // Reseta domínios
            state.domains = { ...manualDomains };
            state.invalidDomains = [];

            // Processa novamente o texto bruto de cada arquivo com sucesso
            state.files.forEach(file => {
                if (file.status === 'success' && file.rawText) {
                    (file.auditEvents || []).forEach(addInvalidAuditEntry);
                    extractDomainsFromText(file.rawText, file.name);
                }
            });

            updateAllDomainsWhitelistStatus();
            resetPagination();
            renderTable();
            renderInvalidTable();
            updateStats();
        }

        // Extrai domínios do texto bruto aplicando as regras de processamento linha por linha
        function extractDomainsFromText(text, sourceFilename) {
            const fileObj = state.files.find(f => f.name === sourceFilename);
            const result = DomainExtractionEngine.extract(text, sourceFilename, state.rules);
            const stats = result.stats;

            result.invalids.forEach(addInvalidAuditEntry);

            result.domains.forEach(item => {
                const finalDomain = item.domain;
                if (state.domains[finalDomain]) {
                    state.domains[finalDomain].count++;
                } else {
                    state.domains[finalDomain] = {
                        count: 1,
                        source: sourceFilename,
                        manual: false,
                        isWhitelisted: false,
                        whitelistReason: ''
                    };
                    updateDomainWhitelistStatus(finalDomain);
                }
            });

            if (fileObj) {
                fileObj.stats = stats;
            }

            // Exibe logs detalhados no console
            console.group(`%cProcessamento de Arquivo: ${sourceFilename}`, 'color: #6366f1; font-weight: bold;');
            console.log(`Linhas Totais: ${stats.totalLines}`);
            console.log(`Linhas Vazias/Comentários: ${stats.emptyLines}`);
            console.log(`Linhas Inválidas: ${stats.invalidLines}`);
            console.log(`Linhas Duplicadas (neste arquivo): ${stats.duplicates}`);
            console.log(`Domínios Válidos Finais: ${stats.validDomains}`);
            if (stats.removedDetails.length > 0) {
                console.groupCollapsed('Detalhamento das linhas descartadas');
                stats.removedDetails.forEach(item => {
                    console.log(`Linha ${item.line}: [${item.reason}] "${item.text}"`);
                });
                console.groupEnd();
            }
            console.groupEnd();
        }

        // Limpa e valida uma string candidata a domínio, retornando { domain, reason }
        function cleanDomainCandidate(str) {
            return DomainExtractionEngine.cleanDomainCandidate(str, state.rules);
        }

        // Validação por expressão regular simples de estrutura de Domínio/IP
        function isValidDomainName(domain) {
            return DomainExtractionEngine.isValidDomainName(domain);
        }

        // Alterna entre abas
        window.switchTab = function(tabName) {
            if (state.activeTab === tabName) return;
            state.activeTab = tabName;
            
            document.getElementById('tabBlocklistBtn').classList.toggle('active', tabName === 'blocklist');
            document.getElementById('tabWhitelistBtn').classList.toggle('active', tabName === 'whitelist');
            document.getElementById('tabInvalidBtn').classList.toggle('active', tabName === 'invalid');
            document.getElementById('tabCompareBtn').classList.toggle('active', tabName === 'compare');
            
            const mainContent = document.getElementById('blocklistWhitelistContent');
            const invalidContent = document.getElementById('invalidTabContent');
            const compareContent = document.getElementById('compareTabContent');
            
            const btnAddDomain = document.getElementById('btnAddDomain');
            const btnExportWhitelist = document.getElementById('btnExportWhitelist');
            const btnExport = document.getElementById('btnExport');
            
            if (tabName === 'compare') {
                mainContent.style.display = 'none';
                invalidContent.style.display = 'none';
                compareContent.style.display = 'flex';
                
                // Redesenha tabela do comparador
                renderCompareTable();
                updateCompareStats();
            } else if (tabName === 'invalid') {
                mainContent.style.display = 'none';
                invalidContent.style.display = 'flex';
                compareContent.style.display = 'none';

                renderInvalidTable();
            } else {
                mainContent.style.display = 'flex';
                invalidContent.style.display = 'none';
                compareContent.style.display = 'none';
                
                if (tabName === 'blocklist') {
                    btnAddDomain.style.display = 'flex';
                    btnExportWhitelist.style.display = 'none';
                    btnExport.style.display = 'flex';
                } else {
                    btnAddDomain.style.display = 'none';
                    btnExportWhitelist.style.display = 'flex';
                    btnExport.style.display = 'none';
                }
                
                renderTable();
            }
        };

        // Renderiza a tabela de Domínios
        function renderTable() {
            const tableHeaderRow = document.getElementById('tableHeaderRow');
            const domainTableBody = document.getElementById('domainTableBody');
            const paginationContainer = document.getElementById('paginationContainer');
            
            domainTableBody.innerHTML = '';
            
            // 1. Mapeia domínios para formato de lista
            const domainList = Object.keys(state.domains).map(d => ({
                domain: d,
                ...state.domains[d]
            }));

            if (state.activeTab !== 'blocklist' && state.activeTab !== 'whitelist') {
                document.getElementById('badgeBlocklistCount').innerText = domainList.filter(item => !item.isWhitelisted).length;
                document.getElementById('badgeWhitelistCount').innerText = domainList.filter(item => item.isWhitelisted).length;
                document.getElementById('badgeInvalidCount').innerText = state.invalidDomains.length;
                return;
            }

            // 2. Filtra por termo de busca
            let filteredList = domainList.filter(item => {
                return item.domain.includes(state.searchQuery);
            });

            // 3. Separa pela aba ativa e ajusta cabeçalhos
            if (state.activeTab === 'blocklist') {
                filteredList = filteredList.filter(item => !item.isWhitelisted);
                tableHeaderRow.innerHTML = `
                    <th style="width: 50%;">Domínio</th>
                    <th style="width: 15%; text-align: center;">Ocorrências</th>
                    <th style="width: 20%;">Origem</th>
                    <th style="width: 15%; text-align: center;">Ações</th>
                `;
            } else {
                filteredList = filteredList.filter(item => item.isWhitelisted);
                tableHeaderRow.innerHTML = `
                    <th style="width: 40%;">Domínio</th>
                    <th style="width: 20%;">Motivo</th>
                    <th style="width: 20%;">Origem</th>
                    <th style="width: 20%; text-align: center;">Ações</th>
                `;
            }

            // 4. Atualiza os contadores das abas
            const totalBlocklistCount = domainList.filter(item => !item.isWhitelisted).length;
            const totalWhitelistCount = domainList.filter(item => item.isWhitelisted).length;
            document.getElementById('badgeBlocklistCount').innerText = totalBlocklistCount;
            document.getElementById('badgeWhitelistCount').innerText = totalWhitelistCount;

            // 5. Ordena a lista
            if (state.activeTab === 'blocklist') {
                filteredList.sort((a, b) => {
                    if (a.manual && !b.manual) return -1;
                    if (!a.manual && b.manual) return 1;
                    return b.count - a.count;
                });
            } else {
                filteredList.sort((a, b) => a.domain.localeCompare(b.domain));
            }

            // 6. Estado Vazio
            if (filteredList.length === 0) {
                const colspan = 4;
                const message = state.activeTab === 'blocklist' 
                    ? 'Nenhum domínio de bloqueio encontrado.' 
                    : 'Nenhum domínio na lista branca encontrado.';
                
                domainTableBody.innerHTML = `
                    <tr>
                        <td colspan="${colspan}">
                            <div class="empty-state">
                                <svg class="empty-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                <h3>Nenhum domínio encontrado</h3>
                                <p>${message}</p>
                            </div>
                        </td>
                    </tr>
                `;
                paginationContainer.innerHTML = '';
                return;
            }

            // 7. Paginação
            const pag = state.pagination[state.activeTab];
            const totalItems = filteredList.length;
            const totalPages = Math.ceil(totalItems / pag.pageSize);
            
            if (pag.currentPage > totalPages) {
                pag.currentPage = totalPages;
            }
            if (pag.currentPage < 1) {
                pag.currentPage = 1;
            }

            const startIndex = (pag.currentPage - 1) * pag.pageSize;
            const endIndex = Math.min(startIndex + pag.pageSize, totalItems);
            const paginatedItems = filteredList.slice(startIndex, endIndex);

            // 8. Renderiza linhas paginadas
            paginatedItems.forEach(item => {
                const tr = document.createElement('tr');
                
                if (state.activeTab === 'blocklist') {
                    const manualBadge = item.manual ? ' <span style="font-size:0.65rem; padding: 0.05rem 0.3rem; background:rgba(6,182,212,0.15); color:var(--accent-cyan); border-radius:3px; font-weight:600;">Manual</span>' : '';
                    
                    tr.innerHTML = `
                        <td>
                            <div class="domain-cell">
                                <span contenteditable="true" class="domain-editable" onblur="handleDomainEdit(this, '${item.domain}')">${item.domain}</span>
                                ${manualBadge}
                            </div>
                        </td>
                        <td style="text-align: center;">
                            <span class="count-badge">${item.count}</span>
                        </td>
                        <td>
                            <div class="source-cell" title="${item.source}">${item.source}</div>
                        </td>
                        <td>
                            <div class="actions-cell" style="justify-content: center;">
                                <button class="action-icon-btn whitelist" onclick="whitelistDirectly('${item.domain}')" title="Adicionar à Lista Branca">
                                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                </button>
                                <button class="action-icon-btn delete" onclick="deleteDomain('${item.domain}')" title="Excluir Domínio">
                                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </td>
                    `;
                } else {
                    const reason = item.whitelistReason || 'Regra';
                    let reasonColor = 'var(--text-muted)';
                    if (reason === 'Governo/órgão público') reasonColor = 'var(--accent-cyan)';
                    else if (reason === 'ANATEL') reasonColor = 'var(--accent-green)';
                    else if (reason === 'Banco/financeiro') reasonColor = 'var(--accent-yellow)';
                    else if (reason === 'Rede social essencial') reasonColor = '#a5b4fc';
                    else if (reason === 'Manual') reasonColor = 'var(--accent-yellow)';
                    
                    const reasonBadge = `<span style="font-size:0.75rem; padding: 0.15rem 0.4rem; background:rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); color:${reasonColor}; border-radius:4px; font-weight:500;">${reason}</span>`;
                    
                    let whitelistActionBtn = '';
                    if (reason === 'Manual') {
                        whitelistActionBtn = `
                            <button class="action-icon-btn whitelist" onclick="removeWhitelistDirectly('${item.domain}')" title="Remover da Lista Branca (Mover para Bloqueio)">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M19.69 14a8.18 8.18 0 0 1-.69 3 8 8 0 0 1-7 5 8 8 0 0 1-7-5V11a8 8 0 0 1 2.18-5.46"></path><path d="m2 2 20 20"></path></svg>
                            </button>
                        `;
                    } else {
                        whitelistActionBtn = `
                            <button class="action-icon-btn" style="opacity: 0.3; cursor: not-allowed;" title="Automatizado pelas Regras de Limpeza" disabled>
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            </button>
                        `;
                    }

                    tr.innerHTML = `
                        <td>
                            <div class="domain-cell">
                                <span class="domain-name" style="padding-left: 0.4rem; color: var(--text-muted);">${item.domain}</span>
                            </div>
                        </td>
                        <td>
                            ${reasonBadge}
                        </td>
                        <td>
                            <div class="source-cell" title="${item.source}">${item.source}</div>
                        </td>
                        <td>
                            <div class="actions-cell" style="justify-content: center;">
                                ${whitelistActionBtn}
                                <button class="action-icon-btn delete" onclick="deleteDomain('${item.domain}')" title="Excluir Domínio">
                                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </td>
                    `;
                }
                domainTableBody.appendChild(tr);
            });

            // 9. Renderiza a Paginação
            renderPaginationControls(totalPages, pag.currentPage, totalItems, startIndex + 1, endIndex);
        }

        function renderInvalidTable() {
            if (!invalidTableBody || !invalidPaginationContainer) return;

            invalidTableBody.innerHTML = '';

            const query = state.invalidSearchQuery;
            let filteredList = state.invalidDomains;
            if (query) {
                filteredList = filteredList.filter(item => {
                    return item.text.toLowerCase().includes(query) ||
                        item.reason.toLowerCase().includes(query) ||
                        item.source.toLowerCase().includes(query) ||
                        String(item.line).toLowerCase().includes(query);
                });
            }

            if (invalidTotalCount) {
                invalidTotalCount.innerText = state.invalidDomains.length;
            }
            document.getElementById('badgeInvalidCount').innerText = state.invalidDomains.length;

            if (filteredList.length === 0) {
                invalidTableBody.innerHTML = `
                    <tr>
                        <td colspan="4">
                            <div class="empty-state">
                                <svg class="empty-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                <h3>Nenhum inválido encontrado</h3>
                                <p>${query ? 'Tente ajustar sua busca.' : 'Os descartes por invalidação aparecerão aqui durante o processamento.'}</p>
                            </div>
                        </td>
                    </tr>
                `;
                invalidPaginationContainer.innerHTML = '';
                return;
            }

            const pag = state.pagination.invalid;
            const totalItems = filteredList.length;
            const totalPages = Math.ceil(totalItems / pag.pageSize);

            if (pag.currentPage > totalPages) pag.currentPage = totalPages;
            if (pag.currentPage < 1) pag.currentPage = 1;

            const startIndex = (pag.currentPage - 1) * pag.pageSize;
            const endIndex = Math.min(startIndex + pag.pageSize, totalItems);
            const paginatedItems = filteredList.slice(startIndex, endIndex);

            paginatedItems.forEach(item => {
                const tr = document.createElement('tr');
                const safeText = escapeHtml(item.text);
                const safeReason = escapeHtml(item.reason);
                const safeSource = escapeHtml(item.source);
                const safeLine = escapeHtml(item.line || '-');

                tr.innerHTML = `
                    <td><div class="invalid-original-cell" title="${safeText}">${safeText}</div></td>
                    <td><span class="invalid-reason-badge">${safeReason}</span></td>
                    <td><div class="source-cell" title="${safeSource}">${safeSource}</div></td>
                    <td style="text-align: center;"><span class="line-badge">${safeLine}</span></td>
                `;
                invalidTableBody.appendChild(tr);
            });

            renderInvalidPaginationControls(totalPages, pag.currentPage, totalItems, startIndex + 1, endIndex);
        }

        function renderInvalidPaginationControls(totalPages, currentPage, totalItems, startItem, endItem) {
            invalidPaginationContainer.innerHTML = '';

            if (totalPages <= 1) {
                invalidPaginationContainer.innerHTML = `
                    <div>Mostrando todos os <b>${totalItems}</b> inválidos</div>
                    <div></div>
                `;
                return;
            }

            const infoDiv = document.createElement('div');
            infoDiv.innerHTML = `Mostrando <b>${startItem}-${endItem}</b> de <b>${totalItems}</b> inválidos`;
            invalidPaginationContainer.appendChild(infoDiv);

            const buttonsDiv = document.createElement('div');
            buttonsDiv.className = 'pagination-buttons';

            const btnFirst = document.createElement('button');
            btnFirst.className = 'pagination-btn';
            btnFirst.innerText = '«';
            btnFirst.disabled = (currentPage === 1);
            btnFirst.onclick = () => changeInvalidPage(1);
            buttonsDiv.appendChild(btnFirst);

            const btnPrev = document.createElement('button');
            btnPrev.className = 'pagination-btn';
            btnPrev.innerText = '‹';
            btnPrev.disabled = (currentPage === 1);
            btnPrev.onclick = () => changeInvalidPage(currentPage - 1);
            buttonsDiv.appendChild(btnPrev);

            let startPage = Math.max(1, currentPage - 2);
            let endPage = Math.min(totalPages, currentPage + 2);

            if (currentPage <= 3) endPage = Math.min(totalPages, 5);
            if (currentPage >= totalPages - 2) startPage = Math.max(1, totalPages - 4);

            for (let i = startPage; i <= endPage; i++) {
                const btnPage = document.createElement('button');
                btnPage.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
                btnPage.innerText = i;
                btnPage.onclick = () => changeInvalidPage(i);
                buttonsDiv.appendChild(btnPage);
            }

            const btnNext = document.createElement('button');
            btnNext.className = 'pagination-btn';
            btnNext.innerText = '›';
            btnNext.disabled = (currentPage === totalPages);
            btnNext.onclick = () => changeInvalidPage(currentPage + 1);
            buttonsDiv.appendChild(btnNext);

            const btnLast = document.createElement('button');
            btnLast.className = 'pagination-btn';
            btnLast.innerText = '»';
            btnLast.disabled = (currentPage === totalPages);
            btnLast.onclick = () => changeInvalidPage(totalPages);
            buttonsDiv.appendChild(btnLast);

            invalidPaginationContainer.appendChild(buttonsDiv);
        }

        window.changeInvalidPage = function(pageNumber) {
            state.pagination.invalid.currentPage = pageNumber;
            renderInvalidTable();
            document.querySelector('#invalidTabContent .table-wrapper').scrollTop = 0;
        };

        // Renderiza botões de controle da paginação
        function renderPaginationControls(totalPages, currentPage, totalItems, startItem, endItem) {
            const paginationContainer = document.getElementById('paginationContainer');
            paginationContainer.innerHTML = '';

            if (totalPages <= 1) {
                paginationContainer.innerHTML = `
                    <div>Mostrando todos os <b>${totalItems}</b> domínios</div>
                    <div></div>
                `;
                return;
            }

            const infoDiv = document.createElement('div');
            infoDiv.innerHTML = `Mostrando <b>${startItem}-${endItem}</b> de <b>${totalItems}</b> domínios`;
            paginationContainer.appendChild(infoDiv);

            const buttonsDiv = document.createElement('div');
            buttonsDiv.className = 'pagination-buttons';

            const btnFirst = document.createElement('button');
            btnFirst.className = 'pagination-btn';
            btnFirst.innerText = '«';
            btnFirst.disabled = (currentPage === 1);
            btnFirst.onclick = () => changePage(1);
            buttonsDiv.appendChild(btnFirst);

            const btnPrev = document.createElement('button');
            btnPrev.className = 'pagination-btn';
            btnPrev.innerText = '‹';
            btnPrev.disabled = (currentPage === 1);
            btnPrev.onclick = () => changePage(currentPage - 1);
            buttonsDiv.appendChild(btnPrev);

            let startPage = Math.max(1, currentPage - 2);
            let endPage = Math.min(totalPages, currentPage + 2);
            
            if (currentPage <= 3) {
                endPage = Math.min(totalPages, 5);
            }
            if (currentPage >= totalPages - 2) {
                startPage = Math.max(1, totalPages - 4);
            }

            for (let i = startPage; i <= endPage; i++) {
                const btnPage = document.createElement('button');
                btnPage.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
                btnPage.innerText = i;
                btnPage.onclick = () => changePage(i);
                buttonsDiv.appendChild(btnPage);
            }

            const btnNext = document.createElement('button');
            btnNext.className = 'pagination-btn';
            btnNext.innerText = '›';
            btnNext.disabled = (currentPage === totalPages);
            btnNext.onclick = () => changePage(currentPage + 1);
            buttonsDiv.appendChild(btnNext);

            const btnLast = document.createElement('button');
            btnLast.className = 'pagination-btn';
            btnLast.innerText = '»';
            btnLast.disabled = (currentPage === totalPages);
            btnLast.onclick = () => changePage(totalPages);
            buttonsDiv.appendChild(btnLast);

            paginationContainer.appendChild(buttonsDiv);
        }

        // Controla mudança de página
        window.changePage = function(pageNumber) {
            state.pagination[state.activeTab].currentPage = pageNumber;
            renderTable();
            document.querySelector('.table-wrapper').scrollTop = 0;
        };

        // Manipula edição direta do domínio na tabela
        window.handleDomainEdit = function(element, oldDomain) {
            const newDomain = element.innerText.trim().toLowerCase();
            if (newDomain === oldDomain) return;

            if (!isValidDomainName(newDomain)) {
                alert('Nome de domínio inválido. Edição descartada.');
                element.innerText = oldDomain;
                return;
            }

            const oldData = state.domains[oldDomain];
            delete state.domains[oldDomain];
            state.domains[newDomain] = oldData;
            
            updateDomainWhitelistStatus(newDomain);

            renderTable();
            updateStats();
        };

        // Adiciona um domínio diretamente à Whitelist a partir da linha correspondente
        window.whitelistDirectly = function(domain) {
            state.whitelist.add(domain);
            renderWhitelist();
            updateAllDomainsWhitelistStatus();
            resetPagination();
            renderTable();
            refreshComparisonIfReady();
            updateStats();
        };

        // Remove um domínio da Whitelist e o devolve para o bloqueio normal
        window.removeWhitelistDirectly = function(domain) {
            state.whitelist.delete(domain);
            renderWhitelist();
            updateAllDomainsWhitelistStatus();
            resetPagination();
            renderTable();
            refreshComparisonIfReady();
            updateStats();
        };

        // Exclui um domínio da listagem
        window.deleteDomain = function(domain) {
            delete state.domains[domain];
            renderTable();
            updateStats();
        };

        // Prompt de adição manual de domínio
        function addManualDomainPrompt() {
            const domain = prompt("Digite o domínio ou IP a ser adicionado manualmente (ex: malware.com):");
            if (domain === null) return;
            
            const cleanResult = cleanDomainCandidate(domain);
            if (!cleanResult.domain) {
                addInvalidAuditEntry({
                    text: domain,
                    reason: cleanResult.reason,
                    source: 'Adição Manual',
                    line: '-'
                });
                renderInvalidTable();
                updateStats();
                alert("Domínio inválido ou ignorado: " + cleanResult.reason);
                return;
            }
            const clean = cleanResult.domain;

            if (state.domains[clean]) {
                state.domains[clean].count++;
            } else {
                state.domains[clean] = {
                    count: 1,
                    source: 'Adicionado Manualmente',
                    manual: true,
                    isWhitelisted: false,
                    whitelistReason: ''
                };
                updateDomainWhitelistStatus(clean);
            }

            resetPagination();
            renderTable();
            updateStats();
        }

        // Atualização de Estatísticas no painel superior
        function updateStats() {
            const filesCount = state.files.filter(f => f.status === 'success').length;
            statFiles.innerText = filesCount;

            // Domínios Brutos: soma de domínios válidos + duplicados de todos os arquivos de sucesso, mais domínios manuais
            let totalRaw = 0;
            state.files.forEach(f => {
                if (f.status === 'success' && f.stats) {
                    totalRaw += f.stats.validDomains + f.stats.duplicates;
                }
            });
            const manualCount = Object.values(state.domains).filter(d => d.manual).length;
            totalRaw += manualCount;
            statTotalDomains.innerText = totalRaw;

            const domainList = Object.keys(state.domains);
            const filteredCount = domainList.filter(d => state.domains[d].isWhitelisted).length;
            statFiltered.innerText = filteredCount;

            const readyCount = domainList.length - filteredCount;
            statExportCount.innerText = readyCount;

            const invalidCount = state.invalidDomains.length;
            const badgeInvalidCount = document.getElementById('badgeInvalidCount');
            if (badgeInvalidCount) badgeInvalidCount.innerText = invalidCount;
            if (invalidTotalCount) invalidTotalCount.innerText = invalidCount;
        }

        // Limpa todos os dados
        function clearAll() {
            if (confirm("Deseja realmente limpar todos os arquivos e domínios carregados?")) {
                state.files = [];
                state.domains = {};
                state.invalidDomains = [];
                state.invalidSearchQuery = '';
                if (invalidSearchBar) invalidSearchBar.value = '';
                renderFileList();
                resetPagination();
                renderTable();
                renderInvalidTable();
                updateStats();
            }
        }

        // Exportação para TXT da lista de bloqueio
        function exportBlocklist() {
            const domainList = getSortedBlocklistDomains();
            
            if (domainList.length === 0) {
                alert('Nenhum domínio disponível para exportar.');
                return;
            }

            const timestamp = buildTimestampLabel();
            const sourceLabel = getPrimarySourceLabel();
            const fileName = buildSuggestedFilename('blocklist', [sourceLabel, timestamp]);
            triggerDownload(domainList.join('\n'), fileName, EXPORT_PROFILES.blocklist.mimeType);
        }

        // Exportação para TXT da lista branca (exceções)
        function exportWhitelist() {
            const domainList = getSortedWhitelistDomains();
            
            if (domainList.length === 0) {
                alert('Nenhum domínio na lista branca disponível para exportar.');
                return;
            }

            const timestamp = buildTimestampLabel();
            const sourceLabel = getPrimarySourceLabel();
            const fileName = buildSuggestedFilename('whitelist', [sourceLabel, timestamp]);
            triggerDownload(domainList.join('\n'), fileName, EXPORT_PROFILES.whitelist.mimeType);
        }

        // Lógica de Comparação
        function handleCompareFileSelect(e, type) {
            if (e.target.files.length > 0) {
                processCompareFile(e.target.files[0], type);
            }
        }

        async function processCompareFile(file, type) {
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            const isTxt = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');

            if (!isPdf && !isTxt) {
                alert(`O arquivo "${file.name}" não é um PDF ou TXT válido.`);
                return;
            }

            const labelEl = type === 'A' ? labelFileA : labelFileB;
            const statusEl = type === 'A' ? statusFileA : statusFileB;
            const fileInputEl = type === 'A' ? fileInputA : fileInputB;

            labelEl.innerText = file.name;
            statusEl.style.display = 'block';
            statusEl.innerText = 'Processando...';

            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    let text = '';
                    if (isPdf) {
                        const typedArray = new Uint8Array(this.result);
                        text = await extractTextFromPdf(typedArray, file.name, (msg) => {
                            statusEl.innerText = msg;
                        });
                    } else {
                        text = this.result;
                    }

                    const extractedSet = extractDomainsForComparison(text, { preferLineMode: isTxt });
                    
                    if (type === 'A') {
                        state.compare.fileA = {
                            name: file.name,
                            text: text,
                            domains: extractedSet,
                            inputType: detectCompareInputType(file.name)
                        };
                    } else {
                        state.compare.fileB = {
                            name: file.name,
                            text: text,
                            domains: extractedSet,
                            inputType: detectCompareInputType(file.name)
                        };
                    }

                    statusEl.innerText = `Sucesso (${extractedSet.size} domínios)`;
                    
                    // Executa a comparação se ambos estiverem carregados
                    runComparison();
                } catch (err) {
                    console.error(err);
                    statusEl.innerText = 'Erro ao ler arquivo';
                } finally {
                    fileInputEl.value = ''; // Limpa cache
                }
            };

            reader.onerror = function() {
                statusEl.innerText = 'Erro de leitura';
                fileInputEl.value = '';
            };

            if (isPdf) {
                reader.readAsArrayBuffer(file);
            } else {
                reader.readAsText(file, 'utf-8');
            }
        }

        function normalizeComparisonLine(line) {
            return String(line || '')
                .replace(/^\uFEFF/, '')
                .trim()
                .toLowerCase();
        }

        // Para arquivos TXT de listas prontas, preserva a comparação literal linha a linha.
        // Isso evita que o comparador "interprete" a lista e altere a diferença real entre A e B.
        function extractDomainsForComparison(text, { preferLineMode = false } = {}) {
            if (!preferLineMode) {
                return extractDomainsOnlyWithEngine(text);
            }

            const domainSet = new Set();
            const lines = String(text || '').split(/\r?\n/);

            lines.forEach(line => {
                const normalizedLine = normalizeComparisonLine(line);
                if (!normalizedLine) return;

                domainSet.add(normalizedLine);
            });

            return domainSet;
        }

        function extractDomainsOnlyWithEngine(text) {
            const domainSet = new Set();
            const result = DomainExtractionEngine.extract(text, 'Comparador', state.rules);
            result.domains.forEach(item => domainSet.add(item.domain));
            return domainSet;
        }

        // Executa comparação B contra A
        function runComparison() {
            const setA = state.compare.fileA.domains || new Set();
            const setB = state.compare.fileB.domains || new Set();

            const newDomains = [];
            const whitelistExcluded = [];
            let duplicatedInA = 0;
            
            setB.forEach(domain => {
                if (setA.has(domain)) {
                    duplicatedInA++;
                    return;
                }

                if (isWhitelisted(domain)) {
                    whitelistExcluded.push(domain);
                } else {
                    newDomains.push(domain);
                }
            });

            state.compare.results = newDomains.sort();
            state.compare.whitelistExcluded = whitelistExcluded.sort();
            state.compare.duplicatedInA = duplicatedInA;
            state.compare.pagination.currentPage = 1;
            
            renderCompareTable();
            updateCompareStats();
        }

        // Atualiza contadores específicos do comparador
        function updateCompareStats() {
            const setA = state.compare.fileA.domains || new Set();
            const setB = state.compare.fileB.domains || new Set();
            const results = state.compare.results || [];

            document.getElementById('statCompareA').innerText = setA.size;
            document.getElementById('statCompareB').innerText = setB.size;
            
            document.getElementById('statCompareDuplicated').innerText = Math.max(0, state.compare.duplicatedInA || 0);
            document.getElementById('statCompareNew').innerText = results.length;
        }

        // Renderiza a tabela de domínios inéditos
        function renderCompareTable() {
            compareTableBody.innerHTML = '';
            
            let filteredList = state.compare.results || [];
            
            if (state.compare.searchQuery) {
                filteredList = filteredList.filter(d => d.includes(state.compare.searchQuery));
            }

            if (filteredList.length === 0) {
                compareTableBody.innerHTML = `
                    <tr>
                        <td colspan="2">
                            <div class="empty-state" style="padding: 3rem 1rem;">
                                <svg class="empty-icon" viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                <h3>Nenhum domínio inédito encontrado</h3>
                                <p>${state.compare.searchQuery ? 'Tente ajustar sua busca.' : 'Os arquivos comparados podem ser idênticos ou nenhum arquivo foi carregado.'}</p>
                            </div>
                        </td>
                    </tr>
                `;
                comparePaginationContainer.innerHTML = '';
                return;
            }

            const pag = state.compare.pagination;
            const totalItems = filteredList.length;
            const totalPages = Math.ceil(totalItems / pag.pageSize);

            if (pag.currentPage > totalPages) pag.currentPage = totalPages;
            if (pag.currentPage < 1) pag.currentPage = 1;

            const startIndex = (pag.currentPage - 1) * pag.pageSize;
            const endIndex = Math.min(startIndex + pag.pageSize, totalItems);
            const paginatedItems = filteredList.slice(startIndex, endIndex);

            paginatedItems.forEach(domain => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div class="domain-cell">
                            <span class="domain-name" style="padding-left: 0.4rem; color: #fff;">${domain}</span>
                        </div>
                    </td>
                    <td>
                        <div class="actions-cell" style="justify-content: center;">
                            <button class="action-icon-btn delete" onclick="deleteCompareDomain('${domain}')" title="Excluir da Lista Resultante">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </td>
                `;
                compareTableBody.appendChild(tr);
            });

            renderComparePaginationControls(totalPages, pag.currentPage, totalItems, startIndex + 1, endIndex);
        }

        // Renderiza botões de controle da paginação do comparador
        function renderComparePaginationControls(totalPages, currentPage, totalItems, startItem, endItem) {
            comparePaginationContainer.innerHTML = '';

            if (totalPages <= 1) {
                comparePaginationContainer.innerHTML = `
                    <div>Mostrando todos os <b>${totalItems}</b> inéditos</div>
                    <div></div>
                `;
                return;
            }

            const infoDiv = document.createElement('div');
            infoDiv.innerHTML = `Mostrando <b>${startItem}-${endItem}</b> de <b>${totalItems}</b> inéditos`;
            comparePaginationContainer.appendChild(infoDiv);

            const buttonsDiv = document.createElement('div');
            buttonsDiv.className = 'pagination-buttons';

            const btnFirst = document.createElement('button');
            btnFirst.className = 'pagination-btn';
            btnFirst.innerText = '«';
            btnFirst.disabled = (currentPage === 1);
            btnFirst.onclick = () => changeComparePage(1);
            buttonsDiv.appendChild(btnFirst);

            const btnPrev = document.createElement('button');
            btnPrev.className = 'pagination-btn';
            btnPrev.innerText = '‹';
            btnPrev.disabled = (currentPage === 1);
            btnPrev.onclick = () => changeComparePage(currentPage - 1);
            buttonsDiv.appendChild(btnPrev);

            let startPage = Math.max(1, currentPage - 2);
            let endPage = Math.min(totalPages, currentPage + 2);
            
            if (currentPage <= 3) endPage = Math.min(totalPages, 5);
            if (currentPage >= totalPages - 2) startPage = Math.max(1, totalPages - 4);

            for (let i = startPage; i <= endPage; i++) {
                const btnPage = document.createElement('button');
                btnPage.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
                btnPage.innerText = i;
                btnPage.onclick = () => changeComparePage(i);
                buttonsDiv.appendChild(btnPage);
            }

            const btnNext = document.createElement('button');
            btnNext.className = 'pagination-btn';
            btnNext.innerText = '›';
            btnNext.disabled = (currentPage === totalPages);
            btnNext.onclick = () => changeComparePage(currentPage + 1);
            buttonsDiv.appendChild(btnNext);

            const btnLast = document.createElement('button');
            btnLast.className = 'pagination-btn';
            btnLast.innerText = '»';
            btnLast.disabled = (currentPage === totalPages);
            btnLast.onclick = () => changeComparePage(totalPages);
            buttonsDiv.appendChild(btnLast);

            comparePaginationContainer.appendChild(buttonsDiv);
        }

        window.changeComparePage = function(pageNumber) {
            state.compare.pagination.currentPage = pageNumber;
            renderCompareTable();
            document.querySelector('#compareTabContent .table-wrapper').scrollTop = 0;
        };

        // Permite excluir um domínio inédito resultante da comparação localmente
        window.deleteCompareDomain = function(domain) {
            state.compare.results = state.compare.results.filter(d => d !== domain);
            renderCompareTable();
            updateCompareStats();
        };

        // Limpa o estado do comparador
        function clearCompare() {
            state.compare.fileA = { name: '', text: '', domains: new Set(), inputType: '' };
            state.compare.fileB = { name: '', text: '', domains: new Set(), inputType: '' };
            state.compare.results = [];
            state.compare.whitelistExcluded = [];
            state.compare.duplicatedInA = 0;
            state.compare.searchQuery = '';
            
            document.getElementById('labelFileA').innerText = 'Carregar Lista A';
            document.getElementById('labelFileB').innerText = 'Carregar Lista B';
            
            document.getElementById('statusFileA').style.display = 'none';
            document.getElementById('statusFileB').style.display = 'none';
            
            document.getElementById('fileInputA').value = '';
            document.getElementById('fileInputB').value = '';
            document.getElementById('compareSearchBar').value = '';
            
            renderCompareTable();
            updateCompareStats();
        }

        // Exporta resultados inéditos em TXT
        function exportCompareResults() {
            const results = state.compare.results || [];
            if (results.length === 0) {
                alert('Nenhum domínio inédito disponível para exportar.');
                return;
            }

            const exportedAt = new Date();
            const timestamp = buildTimestampLabel(exportedAt);
            const sharedParts = [timestamp];

            const resultFileName = buildSuggestedFilename('compareResult', sharedParts);
            const auditFileName = buildSuggestedFilename('compareAudit', sharedParts);
            const auditReport = buildCompareAuditReport({ exportedAt, resultFileName, auditFileName });

            triggerDownload(results.join('\n'), resultFileName, EXPORT_PROFILES.compareResult.mimeType);
            triggerDownload(JSON.stringify(auditReport, null, 2), auditFileName, EXPORT_PROFILES.compareAudit.mimeType);

            alert([
                'Pacote de exportação preparado.',
                `Salve ${resultFileName} em ${STORAGE_DIRECTORIES.exports}/`,
                `Salve ${auditFileName} em ${STORAGE_DIRECTORIES.audits}/`
            ].join('\n'));
        }

        // Inicia a aplicação
        window.addEventListener('DOMContentLoaded', init);
