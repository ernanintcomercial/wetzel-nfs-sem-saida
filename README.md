# Wetzel — Radar de Expedição

Dashboard estático para acompanhamento de notas fiscais emitidas e ainda sem saída.

Fonte atual: relatório de 04/08/2026.

Os pontos de 29/07 e 04/08 são snapshots reais. Os pontos de 30/07 a 03/08 foram reconstruídos a partir das datas de emissão e saída do relatório de 04/08 e estão identificados no JSON com `reconstructed: true`.

## Atualização local

```powershell
python tools/update_from_xlsx.py "C:\caminho\Detalhamento de Notas Fiscais.xlsx" --groups "C:\caminho\Extração em Tabela (30).xlsx" --regions "C:\caminho\INDEX.xlsx"
```
