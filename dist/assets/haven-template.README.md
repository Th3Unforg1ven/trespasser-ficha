# Modelo de refúgio / Haven Record

`haven-template.pdf` deriva da ficha oficial **Trespasser v2.1.3 - Haven Record.pdf**, fornecida pelo usuário no pacote Trespasser v2.1.3. O arquivo oficial de origem permanece intacto em Downloads. A marca, a arte, as duas páginas Letter, a tabela e as áreas de preenchimento vêm desse original.

O modelo distribuído acrescenta **98 rótulos vetoriais visíveis em português brasileiro com os termos originais em inglês**. Faixas brancas cobrem apenas os antigos rótulos; os títulos usam Pirata One e as listas compactas usam Lusitana. As linhas de rótulo tocadas pelas faixas são repostas. A pequena marca “Haven Record” junto do logotipo foi preservada como parte da composição original. Esta é uma adaptação não oficial da ficha, sem arte gerada.

As fontes locais ficam em `fonts/`, com suas licenças SIL Open Font License: `PirataOne-OFL.txt` e `Lusitana-OFL.txt`. Não há download de fonte durante a exportação. A camada está pré-composta no PDF para evitar uma dependência adicional de fontkit no navegador.

Reprodução, a partir da raiz do projeto, com Python, ReportLab e pypdf:

```powershell
python scripts/build-haven-template.py "C:\caminho\Trespasser v2.1.3 - Haven Record.pdf"
```

SHA-256 do original: `e1f7e0cc64c54364fc6f41db899af34bcc7c7a49a18f692d3c4f4cc6a80f64d6`.

SHA-256 do modelo bilíngue: `50c9318c1854811c0a1b0636db40f572452118accf12e320b936464bba8d52c9`.

O exportador `haven-export.js` adiciona campos AcroForm genuinamente editáveis ao modelo e páginas de continuação quando necessário. A amostra de validação possui 177 campos canônicos e 177 widgets, todos editáveis e com aparência. A edição, o novo salvamento e a reabertura, a integridade PDF/JSON/ZIP e as continuações de texto foram testadas; as páginas foram renderizadas com Poppler e inspecionadas. O modelo sozinho é a base gráfica; os campos são criados na exportação.

Os valores calculados no PDF são uma fotografia da ficha online e não se recalculam ao editar o arquivo. A fonte dos campos aceita português com acentos; caracteres sem glifo, como certos emojis, produzem erro explícito, e o JSON continua preservando o conteúdo completo.
