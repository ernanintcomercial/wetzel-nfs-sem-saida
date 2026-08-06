# Wetzel — Radar de Expedição

Dashboard estático para acompanhamento de notas fiscais emitidas e ainda sem saída.

Fonte automatizada: `entrada/nfs.xlsx`, exportada manualmente do Power BI.

Os pontos de 29/07, 04/08 e 05/08 são snapshots reais. Os pontos intermediários reconstruídos a partir das datas de emissão e saída estão identificados no JSON com `reconstructed: true`.

## Atualização automática

Ao substituir `entrada/nfs.xlsx` na branch `main`, o GitHub Actions consulta as fontes corporativas de grupos, prioridades e regiões do repositório `testing` em modo leitura, gera os JSONs, registra o snapshot real do dia e publica a atualização do dashboard.

## Atualização local

```powershell
python tools/update_from_xlsx.py "C:\caminho\Detalhamento de Notas Fiscais.xlsx" --groups "C:\caminho\Extracao.xlsx" --priorities "C:\caminho\Clientes_Prioritarios.xlsx" --regions "C:\caminho\INDEX.xlsx"
```

Representantes presentes no `INDEX.xlsx` usam a região nele definida. Para representantes nacionais sem região própria no índice, cada NF é classificada pela UF do cliente na linha da venda.
