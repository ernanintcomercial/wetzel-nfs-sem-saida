# Wetzel — Radar de Expedição

Dashboard estático para acompanhamento de notas fiscais emitidas e ainda sem saída.

Fonte atual: relatório de 05/08/2026.

Os pontos de 29/07, 04/08 e 05/08 são snapshots reais. Os pontos intermediários reconstruídos a partir das datas de emissão e saída estão identificados no JSON com `reconstructed: true`.

## Atualização local

```powershell
python tools/update_from_xlsx.py "C:\caminho\Detalhamento de Notas Fiscais.xlsx" --groups "C:\caminho\Extração em Tabela (30).xlsx" --regions "C:\caminho\INDEX.xlsx"
```

Representantes presentes no `INDEX.xlsx` usam a região nele definida. Para representantes nacionais sem região própria no índice, cada NF é classificada pela UF do cliente na linha da venda.
