import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// 🚨 외부 URL 링크를 완전히 삭제하고, 오직 로컬 폰트만 등록합니다.
// 폰트 이름은 styles에서 사용하는 'NanumGothic'과 정확히 일치시킵니다.
Font.register({
  family: 'NanumGothic',
  src: '/fonts/NanumGothic.ttf', 
});

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'NanumGothic', fontSize: 10 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 30, fontWeight: 'bold', textDecoration: 'underline' },
  
  // 결재란 스타일
  approvalTable: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 20 },
  approvalBox: { width: 60, border: '1pt solid black', marginLeft: -1 },
  approvalHeader: { fontSize: 8, textAlign: 'center', borderBottom: '1pt solid black', padding: 2, backgroundColor: '#f0f0f0' },
  approvalContent: { height: 40 },

  // 메인 테이블 스타일
  table: { width: 'auto', borderStyle: 'solid', borderWidth: 1, borderRightWidth: 0, borderBottomWidth: 0 },
  tableRow: { flexDirection: 'row' },
  tableColHeader: { width: '25%', borderStyle: 'solid', borderWidth: 1, borderLeftWidth: 0, borderTopWidth: 0, backgroundColor: '#f9f9f9', padding: 5 },
  tableCol: { width: '25%', borderStyle: 'solid', borderWidth: 1, borderLeftWidth: 0, borderTopWidth: 0, padding: 5 },
  tableCellHeader: { fontWeight: 'bold', textAlign: 'center' },
  tableCell: { textAlign: 'left' },
  
  // 합계 섹션
  totalSection: { marginTop: 20, textAlign: 'right', fontSize: 14, fontWeight: 'bold' },
  footer: { marginTop: 50, textAlign: 'center', color: 'gray', fontSize: 9 }
});

export const ExpensePDF = ({ data }: { data: any }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* 제목 */}
      <Text style={styles.title}>지출 결의서</Text>

      {/* 결재란 */}
      <View style={styles.approvalTable}>
        <View style={styles.approvalBox}>
          <Text style={styles.approvalHeader}>담당</Text>
          <View style={styles.approvalContent} />
        </View>
        <View style={styles.approvalBox}>
          <Text style={styles.approvalHeader}>검토</Text>
          <View style={styles.approvalContent} />
        </View>
        <View style={styles.approvalBox}>
          <Text style={styles.approvalHeader}>승인</Text>
          <View style={styles.approvalContent} />
        </View>
      </View>

      {/* 신청 정보 요약 */}
      <View style={styles.table}>
        <View style={styles.tableRow}>
          <View style={[styles.tableColHeader, { width: '15%' }]}><Text style={styles.tableCellHeader}>신청인</Text></View>
          <View style={[styles.tableCol, { width: '35%' }]}><Text style={styles.tableCell}>{data.신청자명 || data.userName || '-'}</Text></View>
          <View style={[styles.tableColHeader, { width: '15%' }]}><Text style={styles.tableCellHeader}>신청일</Text></View>
          <View style={[styles.tableCol, { width: '35%' }]}><Text style={styles.tableCell}>{data.날짜 || data.date || '-'}</Text></View>
        </View>
        <View style={styles.tableRow}>
          <View style={[styles.tableColHeader, { width: '15%' }]}><Text style={styles.tableCellHeader}>소속</Text></View>
          <View style={[styles.tableCol, { width: '35%' }]}><Text style={styles.tableCell}>{data.department || '수산사업부'}</Text></View>
          <View style={[styles.tableColHeader, { width: '15%' }]}><Text style={styles.tableCellHeader}>결제수단</Text></View>
          <View style={[styles.tableCol, { width: '35%' }]}><Text style={styles.tableCell}>{data["법인카드 사용 유무"] || '-'}</Text></View>
        </View>
      </View>

      {/* 지출 내역 상세 */}
      <View style={[styles.table, { marginTop: 20 }]}>
        <View style={styles.tableRow}>
          <View style={[styles.tableColHeader, { width: '60%' }]}><Text style={styles.tableCellHeader}>적요 (품목명 및 용도)</Text></View>
          <View style={[styles.tableColHeader, { width: '40%' }]}><Text style={styles.tableCellHeader}>금액</Text></View>
        </View>
        <View style={styles.tableRow}>
          <View style={[styles.tableCol, { width: '60%', height: 150 }]}><Text style={styles.tableCell}>{data.적요 || data.description || '-'}</Text></View>
          <View style={[styles.tableCol, { width: '40%', height: 150, textAlign: 'right' }]}>
            <Text>{Number(data.금액 ?? data.amount ?? 0).toLocaleString()} 원</Text>
          </View>
        </View>
      </View>

      <View style={[styles.table, { marginTop: 12 }]}>
        <View style={styles.tableRow}>
          <View style={[styles.tableColHeader, { width: '20%' }]}><Text style={styles.tableCellHeader}>비고</Text></View>
          <View style={[styles.tableCol, { width: '80%' }]}><Text style={styles.tableCell}>{data.비고 || '-'}</Text></View>
        </View>
      </View>

      <View style={styles.totalSection}>
        <Text>합계 금액: ₩ {Number(data.금액 ?? data.amount ?? 0).toLocaleString()}</Text>
      </View>

      <Text style={styles.footer}>위와 같이 지출 결의서를 제출하오니 승인하여 주시기 바랍니다.</Text>
      <Text style={[styles.footer, { marginTop: 10 }]}>2026년 __월 __일</Text>
      <Text style={[styles.footer, { marginTop: 10, fontSize: 12, color: 'black' }]}>신청인: {data.신청자명 || data.userName || '-'} (인)</Text>
    </Page>
  </Document>
);