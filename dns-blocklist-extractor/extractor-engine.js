(function(global) {
    'use strict';

    const EMAIL_OR_DOMAIN_OR_IP_REGEX = /([a-z0-9._%+-]+@)?((?:[\p{L}0-9][\p{L}0-9-]{0,62}\.)+[\p{L}0-9-]{2,24}|(?:[0-9]{1,3}\.){3}[0-9]{1,3})/giu;
    const FALLBACK_TOKEN_REGEX = /[\p{L}0-9][\p{L}0-9.-]{1,80}[\p{L}0-9-]?/gu;
    const IP_PREFIX_REGEX = /^(?:(?:\d{1,3}\.){3}\d{1,3}|\[[a-fA-F0-9:]+\]|(?:[a-fA-F0-9]{1,4}:){2,}[a-fA-F0-9:]{0,})\s+/;
    const COMMENT_REGEX = /(?:^|\s)(?:#|;|\/\/)/;
    const JUDICIAL_CASE_REGEX = /^\d{4,7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;
    const OCR_TRUNCATED_TLD_REPAIRS = {
        inf: 'info',
        onli: 'online'
    };
    const CRITICAL_SUFFIXES = {
        government: ['.gov.br', '.gov', '.jus.br', '.mp.br', '.leg.br', '.def.br', '.mil.br'],
        anatel: ['anatel.br', 'anatel.gov.br'],
        banks: [
            'bcb.gov.br', 'bb.com.br', 'caixa.gov.br', 'caixa.com.br', 'itau.com.br',
            'bradesco.com.br', 'santander.com.br', 'sicredi.com.br', 'sicoob.com.br',
            'nubank.com.br', 'inter.co', 'bancointer.com.br'
        ],
        social: [
            'facebook.com', 'fb.com', 'instagram.com', 'whatsapp.com', 'youtube.com',
            'youtu.be', 'googlevideo.com', 'tiktok.com', 'twitter.com', 'x.com', 'linkedin.com'
        ]
    };

    function normalizeRules(rules) {
        return {
            ignoreIps: rules?.ignoreIps !== false,
            skipEmails: rules?.skipEmails !== false,
            removeWww: rules?.removeWww === true,
            whitelistCritical: rules?.whitelistCritical !== false && rules?.whitelistGov !== false,
            whitelistAnatel: rules?.whitelistAnatel !== false
        };
    }

    function normalizeDomainForMatch(domain) {
        return String(domain || '')
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .split(/[\/\?#:]/)[0]
            .replace(/^www\./, '');
    }

    function matchesSuffix(domain, suffix) {
        return domain === suffix || domain.endsWith(`.${suffix}`) || domain.endsWith(suffix.startsWith('.') ? suffix : `.${suffix}`);
    }

    function getAutoWhitelistReason(domain, rulesInput) {
        const rules = normalizeRules(rulesInput);
        if (!rules.whitelistCritical) return null;

        const cleanDomain = normalizeDomainForMatch(domain);
        if (!cleanDomain) return null;

        if (rules.whitelistAnatel && CRITICAL_SUFFIXES.anatel.some(suffix => matchesSuffix(cleanDomain, suffix))) return 'ANATEL';
        if (CRITICAL_SUFFIXES.government.some(suffix => cleanDomain.includes(suffix))) return 'Governo/órgão público';
        if (CRITICAL_SUFFIXES.banks.some(suffix => matchesSuffix(cleanDomain, suffix))) return 'Banco/financeiro';
        if (CRITICAL_SUFFIXES.social.some(suffix => matchesSuffix(cleanDomain, suffix))) return 'Rede social essencial';

        return null;
    }

    function isValidDomainName(domain) {
        const domainRegex = /^(?:[\p{L}0-9](?:[\p{L}0-9-]{0,61}[\p{L}0-9])?\.)+[\p{L}0-9-]{2,24}$/iu;
        const blockableMalformedDomainRegex = /^(?:[\p{L}0-9][\p{L}0-9-]{0,62}\.)+[\p{L}0-9-]{2,24}$/iu;
        const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
        const hostnameRegex = /^[\p{L}0-9](?:[\p{L}0-9-]{1,62})$/iu;
        return domainRegex.test(domain) || blockableMalformedDomainRegex.test(domain) || ipRegex.test(domain) || hostnameRegex.test(domain);
    }

    function isIpv4(value) {
        return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value);
    }

    function isLikelyJudicialCaseNumber(value) {
        const candidate = String(value || '').trim().toLowerCase();
        if (!candidate || !candidate.includes('.')) return false;
        if (JUDICIAL_CASE_REGEX.test(candidate)) return true;

        const parts = candidate.split('.');
        if (parts.length >= 3 && parts.every(part => /^\d+(?:-\d+)?$/.test(part))) {
            return true;
        }

        if (parts.length < 4) return false;

        const numericLikeParts = parts.filter(part => /^\d+(?:-\d+)?$/.test(part)).length;
        const alphabeticParts = parts.filter(part => /[\p{L}]/u.test(part)).length;
        return numericLikeParts >= 4 && alphabeticParts === 0;
    }

    function isLikelyTruncatedOcrDomain(value) {
        const candidate = String(value || '').trim().toLowerCase();
        const parts = candidate.split('.').filter(Boolean);
        if (parts.length < 2) return false;

        const tld = parts[parts.length - 1];

        if (OCR_TRUNCATED_TLD_REPAIRS[tld]) return true;

        return false;
    }

    function repairTruncatedOcrDomain(value) {
        const candidate = String(value || '').trim().toLowerCase();
        const parts = candidate.split('.').filter(Boolean);
        if (parts.length < 2) return candidate;

        const tld = parts[parts.length - 1];
        const repairedTld = OCR_TRUNCATED_TLD_REPAIRS[tld];
        if (!repairedTld) return candidate;

        parts[parts.length - 1] = repairedTld;
        return parts.join('.');
    }

    function isClearSingleLabelCandidate(token, wholeLine) {
        const candidate = String(token || '').trim().toLowerCase().replace(/^[.+-]+|[.+-]+$/g, '');
        if (candidate.length < 3 || candidate.length > 63) return false;
        if (candidate.includes('.')) return true;
        if (!/^[\p{L}0-9-]+$/u.test(candidate)) return false;
        if (/^[0-9]+$/.test(candidate)) return false;

        const lineTokens = String(wholeLine || '').trim().split(/\s+/).filter(Boolean);
        if (lineTokens.length === 1) return true;

        const hasLetterAndNumber = /[\p{L}]/u.test(candidate) && /[0-9]/.test(candidate);
        const hasHyphen = candidate.includes('-');
        const hasMaliciousKeyword = /(bet|bets|jogo|cassino|casino|777)/i.test(candidate);
        return hasLetterAndNumber || hasHyphen || hasMaliciousKeyword;
    }

    function collectMatches(clean) {
        EMAIL_OR_DOMAIN_OR_IP_REGEX.lastIndex = 0;
        const matches = Array.from(clean.matchAll(EMAIL_OR_DOMAIN_OR_IP_REGEX)).map(match => ({
            isEmail: !!match[1],
            candidate: match[2],
            original: match[0]
        }));

        if (matches.length > 0) return matches;

        FALLBACK_TOKEN_REGEX.lastIndex = 0;
        return Array.from(clean.matchAll(FALLBACK_TOKEN_REGEX))
            .map(match => match[0])
            .filter(token => isClearSingleLabelCandidate(token, clean))
            .map(token => ({ isEmail: false, candidate: token, original: token }));
    }

    function cleanDomainCandidate(str, rulesInput) {
        const rules = normalizeRules(rulesInput);
        let d = String(str || '').trim().toLowerCase();

        if (d.includes('@')) {
            if (rules.skipEmails) {
                return { domain: null, reason: 'E-mail descartado pelas regras' };
            }
            d = d.split('@')[1];
        }

        d = d.replace(/^https?:\/\//, '');
        d = d.split(/[\/\?#:]/)[0];
        d = d.replace(/^[.+]+|[.+]+$/g, '');

        if (isLikelyTruncatedOcrDomain(d)) {
            d = repairTruncatedOcrDomain(d);
        }

        if (!d) {
            return { domain: null, reason: 'URL vazia após limpeza' };
        }

        if (rules.ignoreIps && (d === 'localhost' || isIpv4(d))) {
            if (d === 'localhost' || d === '127.0.0.1' ||
                d.startsWith('192.168.') ||
                d.startsWith('10.') ||
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(d)) {
                return { domain: null, reason: 'IP local/loopback ignorado' };
            }
        }

        if (rules.removeWww && d.startsWith('www.')) {
            d = d.substring(4);
            if (!d) {
                return { domain: null, reason: 'Domínio vazio após remover www.' };
            }
        }

        if (!isValidDomainName(d)) {
            return { domain: null, reason: 'Estrutura de domínio/IP inválida' };
        }

        if (isLikelyJudicialCaseNumber(d)) {
            return { domain: null, reason: 'Identificador processual/judicial descartado' };
        }

        const parts = d.split('.');
        if (parts.length === 1 && /^[0-9]+$/.test(d)) {
            return { domain: null, reason: 'Hostname numérico sem domínio' };
        }
        if (parts.length > 1 && parts[parts.length - 1].length < 2) {
            return { domain: null, reason: 'Domínio sem extensão ou extensão muito curta' };
        }

        return { domain: d, reason: null };
    }

    function createStats() {
        return {
            totalLines: 0,
            recognizedDomains: 0,
            emptyLines: 0,
            invalidLines: 0,
            invalidCandidates: 0,
            duplicates: 0,
            validDomains: 0,
            removedDetails: []
        };
    }

    function stripCommentFromLine(line) {
        const trimmedLine = String(line || '').trim();
        const commentIndex = trimmedLine.search(COMMENT_REGEX);
        let clean = trimmedLine;
        let commentText = '';

        if (commentIndex !== -1) {
            commentText = clean.substring(commentIndex);
            clean = clean.substring(0, commentIndex).trim();
        }

        return { clean, commentText };
    }

    function stripIpPrefix(value) {
        let clean = String(value || '').trim();
        const ipMatch = clean.match(IP_PREFIX_REGEX);
        if (ipMatch) {
            clean = clean.substring(ipMatch[0].length).trim();
        }
        return clean;
    }

    function shouldPreferStructuredTxtMode(text) {
        const lines = String(text || '').split(/\r?\n/);
        let inspected = 0;
        let structuredLike = 0;

        for (const line of lines) {
            const stripped = stripCommentFromLine(line);
            let clean = stripIpPrefix(stripped.clean);
            if (!clean) continue;

            inspected++;
            if (!/\s/.test(clean) && clean.length <= 255) {
                structuredLike++;
            }

            if (inspected >= 250) break;
        }

        if (inspected === 0) return false;
        return (structuredLike / inspected) >= 0.9;
    }

    function extractStructuredTxt(text, sourceFilename, rulesInput) {
        const rules = normalizeRules(rulesInput);
        const stats = createStats();
        const domains = [];
        const invalids = [];
        const reviewItems = [];
        const seenInFile = new Set();
        const lines = String(text || '').split(/\r?\n/);

        stats.totalLines = lines.length;

        function addRemoved(line, originalText, reason) {
            stats.removedDetails.push({ line, text: originalText, reason });
        }

        function addInvalid(line, originalText, reason) {
            addRemoved(line, originalText, reason);
            invalids.push({
                text: originalText,
                reason,
                source: sourceFilename,
                line
            });
        }

        function addReview(line, originalText, reason, reviewType) {
            reviewItems.push({
                text: originalText,
                reason,
                source: sourceFilename,
                line,
                reviewType
            });
        }

        lines.forEach((line, index) => {
            const lineNum = index + 1;
            const stripped = stripCommentFromLine(line);
            let clean = stripIpPrefix(stripped.clean);

            if (!clean) {
                stats.emptyLines++;
                addRemoved(lineNum, line, stripped.commentText ? 'Comentário removido' : 'Linha vazia');
                return;
            }

            // Em listas TXT estruturadas, preferimos tratar linhas simples literalmente.
            // Quando a linha vier com ruído ou múltiplos tokens, caímos para a extração clássica
            // para não perder domínios que antes eram aceitos pelo motor geral.
            const lineLooksLiteral = !/\s/.test(clean);

            if (lineLooksLiteral) {
                const cleanResult = cleanDomainCandidate(clean, rulesInput);
                if (cleanResult.domain) {
                    stats.recognizedDomains++;
                    const finalDomain = cleanResult.domain;
                    if (seenInFile.has(finalDomain)) {
                        stats.duplicates++;
                        addRemoved(lineNum, clean, `Duplicado: ${finalDomain}`);
                        addReview(lineNum, clean, `Duplicado: ${finalDomain}`, 'duplicate_in_file');
                        return;
                    }

                    seenInFile.add(finalDomain);
                    stats.validDomains++;
                    domains.push({ domain: finalDomain, source: sourceFilename, line: lineNum, original: clean });
                    return;
                }

            }

            const matches = collectMatches(clean);
            if (matches.length === 0) {
                const cleanResult = cleanDomainCandidate(clean, rulesInput);
                stats.invalidLines++;
                if (lineLooksLiteral) {
                    stats.recognizedDomains++;
                    stats.invalidCandidates++;
                }
                addInvalid(lineNum, clean, cleanResult.reason || 'Nenhum padrão de domínio ou IP encontrado');
                return;
            }

            let lineProducedDomain = false;
            matches.forEach(match => {
                stats.recognizedDomains++;
                const cleanResult = cleanDomainCandidate(match.candidate, rulesInput);
                if (!cleanResult.domain) {
                    stats.invalidLines++;
                    stats.invalidCandidates++;
                    addInvalid(lineNum, match.candidate, cleanResult.reason || 'Limpeza descartou domínio');
                    return;
                }

                const finalDomain = cleanResult.domain;
                if (match.isEmail && rules.skipEmails && !getAutoWhitelistReason(finalDomain, rules)) {
                    stats.invalidCandidates++;
                    addInvalid(lineNum, match.original, 'E-mail descartado pelas regras');
                    return;
                }

                if (seenInFile.has(finalDomain)) {
                    stats.duplicates++;
                    addRemoved(lineNum, match.candidate, `Duplicado: ${finalDomain}`);
                    addReview(lineNum, match.candidate, `Duplicado: ${finalDomain}`, 'duplicate_in_file');
                    return;
                }

                seenInFile.add(finalDomain);
                stats.validDomains++;
                lineProducedDomain = true;
                domains.push({ domain: finalDomain, source: sourceFilename, line: lineNum, original: match.candidate });
            });

        });

        return { domains, invalids, reviewItems, stats };
    }

    function extract(text, sourceFilename, rulesInput, options = {}) {
        if (options.preferStructuredTxt && shouldPreferStructuredTxtMode(text)) {
            return extractStructuredTxt(text, sourceFilename, rulesInput);
        }

        const rules = normalizeRules(rulesInput);
        const stats = createStats();
        const domains = [];
        const invalids = [];
        const reviewItems = [];
        const seenInFile = new Set();
        const lines = String(text || '').split(/\r?\n/);

        stats.totalLines = lines.length;

        function addRemoved(line, originalText, reason) {
            stats.removedDetails.push({ line, text: originalText, reason });
        }

        function addInvalid(line, originalText, reason) {
            addRemoved(line, originalText, reason);
            invalids.push({
                text: originalText,
                reason,
                source: sourceFilename,
                line
            });
        }

        function addReview(line, originalText, reason, reviewType) {
            reviewItems.push({
                text: originalText,
                reason,
                source: sourceFilename,
                line,
                reviewType
            });
        }

        lines.forEach((line, index) => {
            const lineNum = index + 1;
            let clean = line.trim();

            const commentIndex = clean.search(COMMENT_REGEX);
            let commentText = '';
            if (commentIndex !== -1) {
                commentText = clean.substring(commentIndex);
                clean = clean.substring(0, commentIndex).trim();
            }

            if (!clean) {
                stats.emptyLines++;
                addRemoved(lineNum, line, commentText ? 'Comentário removido' : 'Linha vazia');
                return;
            }

            const ipMatch = clean.match(IP_PREFIX_REGEX);
            if (ipMatch) {
                clean = clean.substring(ipMatch[0].length).trim();
            }

            if (!clean) {
                stats.emptyLines++;
                addInvalid(lineNum, line, 'Apenas IP sem domínio');
                return;
            }

            const matches = collectMatches(clean);

            if (matches.length === 0) {
                stats.invalidLines++;
                addInvalid(lineNum, line, 'Nenhum padrão de domínio ou IP encontrado');
                return;
            }

            matches.forEach(match => {
                const isEmail = match.isEmail;
                const candidate = match.candidate;
                stats.recognizedDomains++;

                const cleanResult = cleanDomainCandidate(candidate, rules);
                if (!cleanResult.domain) {
                    stats.invalidLines++;
                    stats.invalidCandidates++;
                    addInvalid(lineNum, candidate, cleanResult.reason || 'Limpeza descartou domínio');
                    return;
                }

                const finalDomain = cleanResult.domain;
                if (isEmail && rules.skipEmails && !getAutoWhitelistReason(finalDomain, rules)) {
                    stats.invalidCandidates++;
                    addInvalid(lineNum, match.original, 'E-mail descartado pelas regras');
                    return;
                }

                if (seenInFile.has(finalDomain)) {
                    stats.duplicates++;
                    addRemoved(lineNum, candidate, `Duplicado: ${finalDomain}`);
                    addReview(lineNum, candidate, `Duplicado: ${finalDomain}`, 'duplicate_in_file');
                    return;
                }

                seenInFile.add(finalDomain);
                stats.validDomains++;
                domains.push({ domain: finalDomain, source: sourceFilename, line: lineNum, original: candidate });
            });
        });

        return { domains, invalids, reviewItems, stats };
    }

    global.DomainExtractionEngine = {
        extract,
        cleanDomainCandidate,
        isValidDomainName,
        getAutoWhitelistReason
    };
})(window);
