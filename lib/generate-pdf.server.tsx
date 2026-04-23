/**
 * 서버 전용 PDF 생성 유틸리티
 * @react-pdf/renderer v4 renderToBuffer 사용
 * Next.js 서버 액션에서만 호출할 것 (클라이언트 번들 포함 금지)
 *
 * 이 파일은 입고증·출고증·지출결의서 PDF를 A4 용지 형태로 만들어줍니다.
 * 관리자가 승인하면 자동으로 PDF가 생성되어 Vercel Blob에 저장됩니다.
 */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import path from "path";
import fs from "fs";
import QRCode from "qrcode";

function loadFontDataUri(filename: string): string {
  const candidates = [
    path.join(process.cwd(), "public", "fonts", filename),
    path.join(__dirname, "..", "..", "..", "public", "fonts", filename),
    path.join(__dirname, "public", "fonts", filename),
  ];
  for (const fontPath of candidates) {
    try {
      const buf = fs.readFileSync(fontPath);
      return `data:font/otf;base64,${buf.toString("base64")}`;
    } catch {
      // 다음 후보 경로 시도
    }
  }
  throw new Error(`[PDF] 폰트 파일을 찾을 수 없습니다: ${filename}`);
}

// 최초 PDF 생성 시점에 한 번만 폰트를 등록합니다.
// 모듈 로드 시점에 실행하면 이 모듈을 import하는 모든 서버 액션에서
// 폰트 파일 I/O가 발생해 500 에러를 유발합니다.
let fontRegistered = false;
function ensureFontRegistered() {
  if (fontRegistered) return;
  Font.register({
    family: "NotoSansKR",
    fonts: [
      { src: loadFontDataUri("NotoSansKR-Regular.otf"), fontWeight: "normal" },
      { src: loadFontDataUri("NotoSansKR-Bold.otf"), fontWeight: "bold" },
    ],
  });
  fontRegistered = true;
}

// 한글은 단어 중간에 줄바꿈하지 않도록 처리
Font.registerHyphenationCallback((word) => [word]);

// PDF 문서 전체에서 공통으로 사용하는 스타일 정의
const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "NotoSansKR", fontSize: 10, color: "#111" },
  title: {
    fontSize: 20,
    textAlign: "center",
    fontWeight: "bold",
    marginBottom: 28,
    letterSpacing: 4,
  },
  // 내용을 담는 표 전체 테두리
  table: { borderTop: "1pt solid #333", borderLeft: "1pt solid #333" },
  row: { flexDirection: "row" },
  // 표 왼쪽 열(항목 이름): 회색 배경으로 강조
  th: {
    width: "28%",
    backgroundColor: "#f5f5f5",
    fontWeight: "bold",
    padding: "6pt 8pt",
    borderRight: "1pt solid #333",
    borderBottom: "1pt solid #333",
  },
  // 표 오른쪽 열(실제 값)
  td: {
    width: "72%",
    padding: "6pt 8pt",
    borderRight: "1pt solid #333",
    borderBottom: "1pt solid #333",
  },
  footer: { marginTop: 40, textAlign: "center", color: "#777", fontSize: 9 },
});

// ───────────────────────────── 입고증 ────────────────────────────────────

/** 입고증 PDF에 들어갈 데이터 필드 정의 */
export type InboundPdfData = {
  lotNumber: string;               // LOT 번호
  productName: string;             // 품목명
  spec: string;                    // 규격
  quantity: string | number;       // 입고수량
  storage: string;                 // 보관처
  origin: string;                  // 원산지
  purchasePrice: string | number;  // 수매가
  date: string;                    // 입고일자
  requester: string;               // 신청자명
};

/**
 * 입고증 PDF 레이아웃 컴포넌트
 * 제목 "입 고 증"과 항목별 표를 그린 후 QR코드와 확인 문구를 출력합니다.
 */
function InboundPDF({ data, qrDataUrl }: { data: InboundPdfData; qrDataUrl?: string }) {
  const rows: [string, string][] = [
    ["LOT 번호", data.lotNumber],
    ["품목명", data.productName],
    ["규격", data.spec],
    ["입고수량", data.quantity ? String(data.quantity) : "-"],
    ["보관처", data.storage],
    ["원산지", data.origin],
    [
      "수매가",
      data.purchasePrice
        ? `${Number(data.purchasePrice).toLocaleString("ko-KR")} 원`
        : "-",
    ],
    ["입고일자", data.date],
    ["신청자", data.requester],
  ];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>입 고 증</Text>
        <View style={s.table}>
          {rows.map(([label, value]) => (
            <View key={label} style={s.row}>
              <View style={s.th}>
                <Text>{label}</Text>
              </View>
              <View style={s.td}>
                <Text>{value || "-"}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* QR코드: 현장 스캔용 */}
        {qrDataUrl && (
          <View style={{ marginTop: 28, alignItems: "center" }}>
            <Image src={qrDataUrl} style={{ width: 100, height: 100 }} />
            <Text style={{ marginTop: 6, fontSize: 9, color: "#555" }}>
              LOT: {data.lotNumber}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 8, color: "#999" }}>
              QR코드를 스캔하면 LOT 번호를 바로 입력할 수 있습니다
            </Text>
          </View>
        )}

        <Text style={s.footer}>위 내용으로 입고가 승인되었음을 확인합니다.</Text>
      </Page>
    </Document>
  );
}

// ───────────────────────────── 출고증 ────────────────────────────────────

/** 출고증 PDF에 들어갈 데이터 필드 정의 */
export type OutboundPdfData = {
  lotNumber: string;              // LOT 번호
  productName: string;            // 품목명
  quantity: string | number;      // 출고수량
  buyer: string;                  // 판매처
  saleAmount: string | number;    // 판매금액
  date: string;                   // 출고일
  requester: string;              // 신청자명
};

/**
 * 출고증 PDF 레이아웃 컴포넌트
 * 제목 "출 고 증"과 항목별 표를 그린 후 하단에 확인 문구를 출력합니다.
 */
function OutboundPDF({ data }: { data: OutboundPdfData }) {
  const rows: [string, string][] = [
    ["LOT 번호", data.lotNumber],
    ["품목명", data.productName],
    ["출고수량", data.quantity ? String(data.quantity) : "-"],
    ["판매처", data.buyer],
    [
      "판매금액",
      data.saleAmount
        ? `${Number(data.saleAmount).toLocaleString("ko-KR")} 원`
        : "-",
    ],
    ["출고일", data.date],
    ["신청자", data.requester],
  ];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>출 고 증</Text>
        <View style={s.table}>
          {rows.map(([label, value]) => (
            <View key={label} style={s.row}>
              <View style={s.th}>
                <Text>{label}</Text>
              </View>
              <View style={s.td}>
                <Text>{value || "-"}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={s.footer}>위 내용으로 출고가 승인되었음을 확인합니다.</Text>
      </Page>
    </Document>
  );
}

// ───────────────────────────── 지출결의서 ────────────────────────────────

/** 지출결의서 PDF에 들어갈 데이터 필드 정의 */
export type ExpensePdfData = {
  createdDate: string;           // 작성일
  requester: string;             // 신청자
  dept: string;                  // 소속
  position: string;              // 직급
  expenseDate: string;           // 지출일
  title: string;                 // 항목명(건명)
  amount: string | number;       // 금액
  description: string;           // 적요 (지출 내용 설명)
  approvalStatus: string;        // 승인상태
};

// 지출결의서 전용 스타일 (결재란 레이아웃)
const expense = StyleSheet.create({
  approvalRow: {
    flexDirection: "row",
    justifyContent: "flex-end", // 결재란을 오른쪽에 배치
    marginBottom: 20,
  },
  // 결재란 첫 번째~두 번째 박스 (담당, 검토): 왼쪽·위·아래 테두리만
  approvalBox: {
    width: 56,
    borderTop: "1pt solid #333",
    borderLeft: "1pt solid #333",
    borderBottom: "1pt solid #333",
  },
  // 결재란 마지막 박스 (승인): 네 면 모두 테두리
  approvalBoxLast: {
    width: 56,
    border: "1pt solid #333",
  },
  approvalHeader: {
    fontSize: 8,
    textAlign: "center",
    borderBottom: "1pt solid #333",
    padding: "3pt 0",
    backgroundColor: "#f5f5f5",
  },
  approvalBody: { height: 36 }, // 서명 공간
});

/**
 * 지출결의서 PDF 레이아웃 컴포넌트
 * 오른쪽 상단에 결재란(담당/검토/승인)이 있고, 그 아래 지출 내용 표를 출력합니다.
 */
function ExpensePDF({ data }: { data: ExpensePdfData }) {
  const rows: [string, string][] = [
    ["작성일", data.createdDate],
    ["신청자", data.requester],
    ["소속", data.dept],
    ["직급", data.position],
    ["지출일", data.expenseDate],
    ["항목명", data.title],
    [
      "금액",
      data.amount ? `${Number(data.amount).toLocaleString("ko-KR")} 원` : "-",
    ],
    ["적요", data.description],
    ["승인상태", data.approvalStatus],
  ];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>지출 결의서</Text>

        {/* 결재란: 담당 / 검토 / 승인 세 칸 */}
        <View style={expense.approvalRow}>
          {["담당", "검토"].map((label) => (
            <View key={label} style={expense.approvalBox}>
              <Text style={expense.approvalHeader}>{label}</Text>
              <View style={expense.approvalBody} />
            </View>
          ))}
          <View style={expense.approvalBoxLast}>
            <Text style={expense.approvalHeader}>승인</Text>
            <View style={expense.approvalBody} />
          </View>
        </View>

        {/* 내용 테이블 */}
        <View style={s.table}>
          {rows.map(([label, value]) => (
            <View key={label} style={s.row}>
              <View style={s.th}>
                <Text>{label}</Text>
              </View>
              <View style={s.td}>
                <Text>{value || "-"}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={s.footer}>
          위와 같이 지출 결의서를 제출하오니 승인하여 주시기 바랍니다.
        </Text>
      </Page>
    </Document>
  );
}

// ───────────────────────────── 내보내기 ──────────────────────────────────

/**
 * 입고증 PDF를 생성하여 Buffer(바이너리 데이터)로 반환합니다.
 * LOT 번호를 QR코드로 변환해 PDF 하단에 삽입합니다.
 * 반환된 Buffer는 Vercel Blob에 업로드됩니다.
 */
export async function generateInboundPdf(data: InboundPdfData): Promise<Buffer> {
  ensureFontRegistered();
  // LOT 번호 → QR 코드 PNG data URL 생성
  let qrDataUrl: string | undefined;
  if (data.lotNumber) {
    try {
      qrDataUrl = await QRCode.toDataURL(data.lotNumber, {
        errorCorrectionLevel: "M",
        width: 300,   // 고해상도로 생성해 인쇄 품질 확보
        margin: 2,
      });
    } catch (e) {
      console.warn("[generateInboundPdf] QR 코드 생성 실패 (PDF는 계속 생성):", e);
    }
  }
  return renderToBuffer(<InboundPDF data={data} qrDataUrl={qrDataUrl} />) as Promise<Buffer>;
}

/**
 * 출고증 PDF를 생성하여 Buffer(바이너리 데이터)로 반환합니다.
 */
export async function generateOutboundPdf(data: OutboundPdfData): Promise<Buffer> {
  ensureFontRegistered();
  return renderToBuffer(<OutboundPDF data={data} />) as Promise<Buffer>;
}

/**
 * 지출결의서 PDF를 생성하여 Buffer(바이너리 데이터)로 반환합니다.
 */
export async function generateExpensePdf(data: ExpensePdfData): Promise<Buffer> {
  ensureFontRegistered();
  return renderToBuffer(<ExpensePDF data={data} />) as Promise<Buffer>;
}
