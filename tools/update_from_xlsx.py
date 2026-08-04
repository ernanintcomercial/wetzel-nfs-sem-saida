import argparse
import json
import unicodedata
from datetime import datetime
from pathlib import Path

import pandas as pd


REGION_MAP = {
    "SUDESTE": "SUDESTE",
    "SUL   CENTRO OESTE": "SUL E CENTRO OESTE",
    "NORTE   NORDESTE": "NORTE E NORDESTE",
}
UNMAPPED_REGION = "SEM REGIÃO / NÃO MAPEADO"
UF_REGIONS = {
    "ESPIRITO SANTO": "SUDESTE", "MINAS GERAIS": "SUDESTE", "RIO DE JANEIRO": "SUDESTE", "SAO PAULO": "SUDESTE",
    "DISTRITO FEDERAL": "SUL E CENTRO OESTE", "GOIAS": "SUL E CENTRO OESTE", "MATO GROSSO": "SUL E CENTRO OESTE",
    "MATO GROSSO DO SUL": "SUL E CENTRO OESTE", "PARANA": "SUL E CENTRO OESTE", "RIO GRANDE DO SUL": "SUL E CENTRO OESTE",
    "SANTA CATARINA": "SUL E CENTRO OESTE",
    "ACRE": "NORTE E NORDESTE", "ALAGOAS": "NORTE E NORDESTE", "AMAPA": "NORTE E NORDESTE", "AMAZONAS": "NORTE E NORDESTE",
    "BAHIA": "NORTE E NORDESTE", "CEARA": "NORTE E NORDESTE", "MARANHAO": "NORTE E NORDESTE", "PARA": "NORTE E NORDESTE",
    "PARAIBA": "NORTE E NORDESTE", "PERNAMBUCO": "NORTE E NORDESTE", "PIAUI": "NORTE E NORDESTE", "RIO GRANDE DO NORTE": "NORTE E NORDESTE",
    "RONDONIA": "NORTE E NORDESTE", "RORAIMA": "NORTE E NORDESTE", "SERGIPE": "NORTE E NORDESTE", "TOCANTINS": "NORTE E NORDESTE",
}


def text(value, default=""):
    if pd.isna(value):
        return default
    return str(value).strip()


def identifier(value):
    number = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    return "" if pd.isna(number) else str(int(number))


def normalize(value):
    raw = unicodedata.normalize("NFKD", text(value).upper())
    return " ".join("".join(ch for ch in raw if not unicodedata.combining(ch)).split())


def resolve_region(representative_id, uf, regions):
    return regions.get(representative_id) or UF_REGIONS.get(normalize(uf), UNMAPPED_REGION)


def iso_date(value):
    return "" if pd.isna(value) else pd.Timestamp(value).strftime("%Y-%m-%d")


def load_source(path):
    df = pd.read_excel(path, sheet_name="Export")
    df = df[pd.to_numeric(df["NF"], errors="coerce").notna()].copy()
    for col in ("Emissão", "Saída", "Lib Octopus"):
        df[col] = pd.to_datetime(df[col], errors="coerce")
    df["Total Faturado"] = pd.to_numeric(df["Total Faturado"], errors="coerce").fillna(0.0)
    return df


def load_group_map(path):
    df = pd.read_excel(path, sheet_name="Export")
    df = df[pd.to_numeric(df["ID Cliente"], errors="coerce").notna() & df["Grupo"].notna()].copy()
    df["clientId"] = df["ID Cliente"].map(identifier)
    return df.drop_duplicates("clientId").set_index("clientId")["Grupo"].astype(str).to_dict()


def load_region_map(path):
    df = pd.read_excel(path, sheet_name="Plan1")
    df = df[pd.to_numeric(df["codigo"], errors="coerce").notna() & df["região"].notna()].copy()
    df["representativeId"] = df["codigo"].map(identifier)
    df["canonical"] = df["região"].astype(str).str.strip().map(REGION_MAP).fillna(UNMAPPED_REGION)
    return df.drop_duplicates("representativeId").set_index("representativeId")["canonical"].to_dict()


def enrich_row(row, reference_date, groups, regions):
    client_id = identifier(row["ID Cliente"])
    representative_id = identifier(row["ID Representante"])
    raw_status = text(row["Sit Octopus"])
    group = groups.get(client_id, "SEM GRUPO MAPEADO")
    return {
        "nf": f"{int(row['NF']):07d}",
        "emission": iso_date(row["Emissão"]),
        "age": int((reference_date - row["Emissão"]).days),
        "clientId": client_id,
        "client": text(row["Cliente"]),
        "representativeId": representative_id,
        "representative": text(row["Representante"]),
        "value": round(float(row["Total Faturado"]), 2),
        "shipment": identifier(row["Embarque"]),
        "octopus": raw_status or "Sem situação",
        "release": iso_date(row["Lib Octopus"]),
        "group": group,
        "region": resolve_region(representative_id, row["Localização - UF"], regions),
        "priority": client_id in groups,
    }


def compact_payload(reference_date, source_updated_at, records):
    dimensions = {}
    for key in ("clients", "representatives", "statuses", "groups", "regions"):
        dimensions[key] = []
    fields = {
        "clients": "client", "representatives": "representative", "statuses": "octopus",
        "groups": "group", "regions": "region",
    }
    indexes = {}
    for dim, field in fields.items():
        for record in records:
            value = record[field]
            if value not in dimensions[dim]:
                dimensions[dim].append(value)
        indexes[dim] = {value: i for i, value in enumerate(dimensions[dim])}
    rows = []
    for r in records:
        rows.append([
            r["nf"], r["age"], r["clientId"], indexes["clients"][r["client"]],
            indexes["representatives"][r["representative"]], r["value"], r["shipment"],
            indexes["statuses"][r["octopus"]], indexes["groups"][r["group"]],
            indexes["regions"][r["region"]], 1 if r["priority"] else 0,
        ])
    return {"referenceDate": reference_date.strftime("%Y-%m-%d"), "sourceUpdatedAt": source_updated_at, **dimensions, "records": rows}


def summarize_snapshot(current, date, groups, regions, reconstructed):
    current = current.copy()
    current["clientId"] = current["ID Cliente"].map(identifier)
    current["representativeId"] = current["ID Representante"].map(identifier)
    current["region"] = [resolve_region(rid, uf, regions) for rid, uf in zip(current["representativeId"], current["Localização - UF"])]
    current["priority"] = current["clientId"].isin(groups)
    region_rows = []
    for region in ["SUDESTE", "SUL E CENTRO OESTE", "NORTE E NORDESTE", UNMAPPED_REGION]:
        items = current[current["region"] == region]
        region_rows.append({
            "label": region,
            "value": round(float(items["Total Faturado"].sum()), 2),
            "count": int(len(items)),
            "maxAge": int((date - items["Emissão"].min()).days) if len(items) else 0,
        })
    result = {
        "date": date.strftime("%Y-%m-%d"),
        "kpis": {
            "value": round(float(current["Total Faturado"].sum()), 2),
            "count": int(len(current)),
            "priorityClients": int(current.loc[current["priority"], "clientId"].nunique()),
            "maxAge": int((date - current["Emissão"].min()).days) if len(current) else 0,
        },
        "regions": region_rows,
    }
    if reconstructed:
        result["reconstructed"] = True
        result["method"] = "Emissão até a data e Saída vazia ou posterior à data"
    return result


def snapshot(df, date, groups, regions, reconstructed=True):
    current = df[(df["Emissão"] <= date) & (df["Saída"].isna() | (df["Saída"] > date))]
    return summarize_snapshot(current, date, groups, regions, reconstructed)


def actual_snapshot(df, date, groups, regions, uf_lookup):
    if "Localização - UF" not in df.columns:
        df = df.copy()
        df["Localização - UF"] = pd.to_numeric(df["NF"], errors="coerce").map(uf_lookup)
        representative_ids = df["ID Representante"].map(identifier)
        missing = int((df["Saída"].isna() & df["Localização - UF"].isna() & ~representative_ids.isin(regions)).sum())
        if missing:
            raise ValueError(f"{missing} NFs do snapshot real ficaram sem UF após a conciliação por NF")
    return summarize_snapshot(df[df["Saída"].isna()], date, groups, regions, reconstructed=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--groups", type=Path, required=True)
    parser.add_argument("--regions", type=Path, required=True)
    parser.add_argument("--history-start", default="2026-07-30")
    parser.add_argument("--actual-snapshot", action="append", default=[], metavar="DATE=PATH")
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    df = load_source(args.source)
    uf_lookup = (
        df.assign(_nf=pd.to_numeric(df["NF"], errors="coerce"))
        .dropna(subset=["_nf", "Localização - UF"])
        .drop_duplicates("_nf")
        .set_index("_nf")["Localização - UF"]
        .to_dict()
    )
    groups = load_group_map(args.groups)
    regions = load_region_map(args.regions)
    reference_date = df["Emissão"].max().normalize()
    open_df = df[df["Saída"].isna()].copy()
    records = [enrich_row(row, reference_date, groups, regions) for _, row in open_df.iterrows()]
    records.sort(key=lambda r: (-r["age"], -r["value"], r["nf"]))
    source_updated_at = datetime.fromtimestamp(args.source.stat().st_mtime).strftime("%d/%m/%Y %H:%M")

    full = {"referenceDate": reference_date.strftime("%Y-%m-%d"), "sourceUpdatedAt": source_updated_at, "records": records}
    compact = compact_payload(reference_date, source_updated_at, records)
    (repo / "nfs.json").write_text(json.dumps(full, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (repo / "nfs-compact.json").write_text(json.dumps(compact, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    history_path = repo / "historico-nfs.json"
    history = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else []
    preserved = {item["date"]: item for item in history if item["date"] < args.history_start}
    for specification in args.actual_snapshot:
        date_text, source_text = specification.split("=", 1)
        snapshot_date = pd.Timestamp(date_text).normalize()
        preserved[date_text] = actual_snapshot(load_source(Path(source_text)), snapshot_date, groups, regions, uf_lookup)
    for date in pd.date_range(args.history_start, reference_date, freq="D"):
        preserved[date.strftime("%Y-%m-%d")] = snapshot(
            df, date, groups, regions, reconstructed=date.normalize() != reference_date
        )
    history = [preserved[key] for key in sorted(preserved)]
    history_path.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "referenceDate": full["referenceDate"], "sourceUpdatedAt": source_updated_at,
        "count": len(records), "value": round(sum(r["value"] for r in records), 2),
        "clients": len({r["clientId"] for r in records}),
        "priorityCount": sum(r["priority"] for r in records),
        "priorityValue": round(sum(r["value"] for r in records if r["priority"]), 2),
        "priorityClients": len({r["clientId"] for r in records if r["priority"]}),
        "maxAge": max(r["age"] for r in records),
        "historyDates": [item["date"] for item in history],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
