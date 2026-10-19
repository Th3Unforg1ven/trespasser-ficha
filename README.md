# Trespasser · Ficha de personagem

Ficha editável não oficial para Trespasser v2.1.3, em português com os termos originais em inglês. Implementação em HTML, CSS e JavaScript, com bibliotecas incluídas localmente e sem dependências de instalação.

## Acessar online

[Abrir a ficha](https://th3unforg1ven.github.io/trespasser-ficha/)

O site pode ser aberto em qualquer dispositivo. Os personagens são salvos neste navegador; para levar uma ficha do localhost ou de outro dispositivo, use **Exportar** e depois **Importar** o JSON no endereço online.

**Exportar** prepara um ZIP com PDF preenchível e JSON do mesmo personagem, com opções para baixar cada arquivo separadamente. Textos longos e feitos ou itens excedentes recebem páginas adicionais, também preenchíveis. Os cálculos exportados podem ser editados manualmente no PDF.

## Executar localmente

Com Node.js instalado, abra um terminal nesta pasta:

```powershell
npm run dev
```

Acesse [http://127.0.0.1:4173](http://127.0.0.1:4173). O servidor aceita conexões apenas neste computador. Para validar o código:

```powershell
npm test
npm run check
```

O conteúdo publicado está em `dist/`. O workflow `.github/workflows/pages.yml` valida o JavaScript, executa os testes e publica somente essa pasta no GitHub Pages a cada atualização da branch `main`. Livros de referência, cópias pessoais, resultados de teste e arquivos temporários não fazem parte da publicação.

## Uso e alcance

- Criação, duplicação e exclusão de personagens; suporte a níveis 0–9.
- Identidade, atributos, perícias, alinhamentos, equipamentos, inventário, feitos, estados, ferimentos e anotações editáveis.
- Valores derivados, recursos atuais, rolagens livres e acompanhamento do custo crescente dos feitos.
- Exportação em PDF preenchível e JSON (juntos em ZIP ou separadamente), importação do JSON e impressão de todas as seções.

O avanço de nível e as escolhas de vocação (Calling), ofício (Craft), talentos e características são manuais. Bônus específicos entram nos ajustes de regras. Estados e aflições ficam registrados; seus efeitos são resolvidos na mesa. A ficha não substitui as decisões do Judge nem implementa automaticamente todas as exceções do livro.

## Cálculos e fontes

Referência: Rulebook e Character Record dos arquivos fornecidos de Trespasser v2.1.3. As páginas abaixo são as páginas numeradas do Rulebook; os documentos originais foram consultados localmente e não são distribuídos neste repositório.

| Valor | Regra básica |
| --- | --- |
| PV máximos | `(nível + 1) × (5 + Might)`, mais ajustes da vocação e outros benefícios |
| Endurance máxima | `10 + Spirit`, mais ajustes; indisponível no nível 0 |
| Skill / Skill die | `+2 / d6` nos níveis 0–2; `+3 / d8` em 3–5; `+4 / d10` em 6–8; `+5 / d12` em 9 |
| Precisão (Accuracy) | atributo-chave + Skill; no nível 0, maior entre Might e Agility + Skill |
| Guarda (Guard) | Agility + AR; com AR ≥ 6, apenas AR |
| Iniciativa / Resistir / Prevalecer | Agility / Spirit / Intellect + Skill |
| Tenacidade (Tenacity) | Might + Spirit |
| Velocidade (Speed) | base 5; bônus igual ao maior entre Agility e 2; com AR ≥ 6, bônus limitado a 2 |
| Inventário | 5 + Might espaços |

Os ajustes manuais são somados aos valores correspondentes. A quantidade diária de dados de recuperação é registrada separadamente e não muda automaticamente quando a Endurance atual diminui. Alterar atributos, nível ou máximos não recupera os recursos atuais.

Fontes principais: pp.11–12 (atributos e perícias), 22–24 (valores e descanso), 44–45 (foco e recuperação), 69 (descanso noturno), 71 e 75 (equipamentos e armadura), 86 (Commoners) e 88–90 (avanço). O descanso noturno recupera PV quando a Endurance restante é maior que zero, redefine os dados de recuperação pela Endurance restante e limpa os custos crescentes; alimentação e condições do descanso precisam ser resolvidas na mesa.

## Salvamento

As fichas são salvas no `localStorage` deste navegador e deste endereço. Não há conta, nuvem ou sincronização entre dispositivos. Usar outro navegador, perfil, endereço ou porta pode mostrar um registro diferente; limpar os dados do navegador pode apagar as fichas.

Use Exportar para guardar os dois arquivos do mesmo personagem. O PDF permite preencher e salvar seus campos em um leitor compatível; use o JSON para restaurar a ficha no site. A importação cria um novo personagem. As cópias do navegador, do PDF e do JSON são independentes.

## Limite da verificação de impressão

O ícone de impressão prepara uma cópia com valores estáticos e textos completos para papel. Para obter um PDF preenchível, use Exportar. O PDF dessa exportação foi validado por renderização, preenchimento, salvamento e reabertura; o diálogo nativo de impressão continua dependendo das opções do navegador.

Os documentos de referência são material de consulta do sistema. Não são necessários para executar o site e não fazem parte da pasta pública `dist/`.

## Direção visual

A interface acompanha a ficha impressa: composição em três colunas, recursos com réguas no topo, molduras pretas com recortes, campos retangulares e papel claro. A identificação usa o logotipo incorporado ao PDF fornecido (Rulebook, página 1), sem alteração do arquivo da imagem.

Lusitana é usada no corpo e Pirata One nos títulos, com preferência por Boucherie Block caso já esteja instalada. Boucherie Block e Nexa Rust são indicadas pelo guia, mas seus arquivos comerciais não foram extraídos. As fontes abertas estão hospedadas localmente, com os avisos SIL OFL em `dist/assets/fonts/`. Fontes: repositório oficial Google Fonts, famílias [Pirata One](https://github.com/google/fonts/tree/main/ofl/pirataone) e [Lusitana](https://github.com/google/fonts/tree/main/ofl/lusitana).
