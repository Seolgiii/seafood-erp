/**
 * 통합 테스트용 Airtable in-memory store
 *
 * 실제 Airtable API 대신 메모리에서 레코드를 관리합니다.
 * fetch-mock이 URL 패턴을 보고 이 store에 GET/POST/PATCH 합니다.
 */

export type Tables =
  | "작업자"
  | "품목마스터"
  | "LOT별 재고"
  | "입고 관리"
  | "출고 관리"
  | "지출결의"
  | "재고 이동"
  | "보관처 마스터"
  | "보관처 비용 이력"
  | "매입처 마스터";

export type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
};

class AirtableStore {
  private data = new Map<Tables, Map<string, AirtableRecord>>();
  private nextSeq = 1;

  reset(): void {
    this.data.clear();
    this.nextSeq = 1;
  }

  /** 테스트 fixture 주입 */
  seed(table: Tables, records: AirtableRecord[]): void {
    if (!this.data.has(table)) this.data.set(table, new Map());
    for (const r of records) {
      this.data.get(table)!.set(r.id, {
        ...r,
        createdTime: r.createdTime ?? new Date().toISOString(),
      });
    }
  }

  get(table: Tables, id: string): AirtableRecord | null {
    return this.data.get(table)?.get(id) ?? null;
  }

  list(table: Tables, filter?: (r: AirtableRecord) => boolean): AirtableRecord[] {
    const all = [...(this.data.get(table)?.values() ?? [])];
    return filter ? all.filter(filter) : all;
  }

  create(table: Tables, fields: Record<string, unknown>): AirtableRecord {
    const id = `recMOCK${String(this.nextSeq++).padStart(11, "0")}`;
    const rec: AirtableRecord = {
      id,
      fields: { ...fields },
      createdTime: new Date().toISOString(),
    };
    if (!this.data.has(table)) this.data.set(table, new Map());
    this.data.get(table)!.set(id, rec);
    return rec;
  }

  patch(
    table: Tables,
    id: string,
    fields: Record<string, unknown>,
  ): AirtableRecord | null {
    const existing = this.get(table, id);
    if (!existing) return null;
    existing.fields = { ...existing.fields, ...fields };
    return existing;
  }

  /** 테스트에서 raw map 접근이 필요할 때 */
  rawTable(table: Tables): Map<string, AirtableRecord> | undefined {
    return this.data.get(table);
  }
}

export const store = new AirtableStore();
