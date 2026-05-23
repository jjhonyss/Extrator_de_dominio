# Script para gerar massa de teste com ~45.000 domínios
$outputFile = "test-domains-large.txt"
$domains = New-Object System.Collections.Generic.List[string]

Write-Host "Gerando domínios normais..."
for ($i = 1; $i -le 35000; $i++) {
    $domains.Add("normal-domain-$i.com")
}

Write-Host "Gerando domínios governamentais (.gov.br e .gov)..."
for ($i = 1; $i -le 3000; $i++) {
    $domains.Add("governo-federal-$i.gov.br")
    $domains.Add("gov-state-$i.gov")
}

Write-Host "Gerando domínios da ANATEL..."
for ($i = 1; $i -le 1000; $i++) {
    $domains.Add("sistema-anatel-$i.anatel.br")
}

Write-Host "Gerando domínios .br genéricos..."
for ($i = 1; $i -le 2000; $i++) {
    $domains.Add("empresa-br-$i.br")
}

Write-Host "Gerando domínios .com.br..."
for ($i = 1; $i -le 3000; $i++) {
    $domains.Add("empresa-combr-$i.com.br")
}

Write-Host "Gerando IPs de Loopback e Locais..."
for ($i = 1; $i -le 500; $i++) {
    $domains.Add("127.0.0.1")
    $domains.Add("192.168.1.$($i % 254)")
    $domains.Add("10.0.0.$($i % 254)")
}

Write-Host "Misturando alguns domínios duplicados..."
for ($i = 1; $i -le 1000; $i++) {
    $domains.Add("normal-domain-$i.com") # duplicados
    $domains.Add("governo-federal-$i.gov.br") # duplicados
}

Write-Host "Salvando no arquivo $outputFile..."
$domains | Out-File -FilePath $outputFile -Encoding utf8
Write-Host "Concluído! Total de linhas escritas: $($domains.Count)"
