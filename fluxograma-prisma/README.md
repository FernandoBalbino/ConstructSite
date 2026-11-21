# Fluxograma PRISMA — editor e gerador de PDF

Editor online de fluxograma no modelo **PRISMA 2020** para revisões sistemáticas e integrativas.
Edite os quadros, confira as contagens e baixe a figura final em **PDF**, **PNG (300 dpi)** ou **SVG**.

🔗 **Acesse:** https://fernandobalbino.github.io/ConstructSite/fluxograma-prisma/

## Dados iniciais

| Fase | Quadro | n |
|---|---|---|
| Identificação | Artigos identificados nas bases de dados PubMed/MEDLINE e SciELO | 11 |
| Triagem e Elegibilidade | Artigos avaliados por meio da leitura de títulos, resumos e textos completos | 11 |
| ↳ Exclusão | Estudos excluídos após a leitura de títulos, resumos e análise dos textos completos por não atenderem aos critérios de elegibilidade | 6 |
| Incluídos | Artigos selecionados para compor a revisão integrativa | 5 |

## Recursos

- Prévia ao vivo: o que aparece na tela é exatamente o que sai no PDF.
- Adicionar, remover e reordenar etapas; quadro de exclusão opcional em cada etapa.
- Conferência automática das contagens (ex.: 11 − 6 = 5).
- Título da figura (acima) e fonte (abaixo), no padrão ABNT.
- Temas de cores (PRISMA 2020, preto e branco, azul, verde), tamanho da fonte e alinhamento.
- PDF em A4 ou com a página ajustada ao fluxograma; PNG em 300 dpi para Word/Google Docs/Canva.
- Salvamento automático no navegador e exportação/importação em `.json`.
- Funciona 100% no navegador (inclusive Chromebook), sem enviar dados a servidores.

## Estrutura

```
index.html       página e formulário
style.css        estilos
prisma-core.js   layout do fluxograma + renderização em SVG e PDF
app.js           interações do editor
lib/             jsPDF (MIT) para gerar o PDF
```

## Referência

Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. *BMJ*. 2021;372:n71. doi:10.1136/bmj.n71
