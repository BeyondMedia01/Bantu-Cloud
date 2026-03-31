import React from 'react';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const DARK_NAVY   = '#1a2e4a';
const BANTU_GREEN = '#B2DB64';
const TEXT_DARK   = '#1e293b';
const TEXT_MUTED  = '#64748b';
const BORDER      = '#e2e8f0';

const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const normalizeLabel = (name) => {
  if (!name) return '';
  const l = name.toLowerCase();
  if (l.includes('wcif') || l.includes('workers') || l.includes('workmen') || l.includes('compensation insurance')) {
    const m = name.match(/\(\s*[\d.]+\s*%\s*\)/);
    return m ? `WCIF ${m[0]}` : 'WCIF (1.25%)';
  }
  return name;
};

const s = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', fontSize: 7.5, paddingBottom: 65 },
  header:     { backgroundColor: DARK_NAVY, padding: 12, flexDirection: 'row',
                justifyContent: 'space-between', alignItems: 'flex-start' },
  company:    { color: BANTU_GREEN, fontFamily: 'Helvetica-Bold', fontSize: 14 },
  meta:       { color: 'white', fontSize: 8, marginTop: 3 },
  title:      { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 20, textAlign: 'right' },

  colHdr:     { backgroundColor: DARK_NAVY, flexDirection: 'row', padding: 4,
                marginHorizontal: 10, marginTop: 14 },
  colHdrText: { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  colAmt:     { width: 68, color: 'white', fontFamily: 'Helvetica-Bold',
                fontSize: 7.5, textAlign: 'right' },

  deptLabel:  { color: DARK_NAVY, fontFamily: 'Helvetica-Bold', fontSize: 9,
                paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  empName:    { color: DARK_NAVY, fontFamily: 'Helvetica-Bold', fontSize: 7.5,
                paddingHorizontal: 10, paddingBottom: 3 },

  threeCol:   { flexDirection: 'row', marginHorizontal: 10 },
  colSection: { flex: 1, borderRightWidth: 0.3, borderColor: BORDER },
  colTitle:   { backgroundColor: '#e8edf3', padding: 3, fontSize: 6.5,
                fontFamily: 'Helvetica-Bold', color: DARK_NAVY },
  dataRow:    { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 2 },
  dataDesc:   { flex: 1, color: TEXT_DARK },
  dataUnits:  { width: 36, textAlign: 'right', color: TEXT_MUTED, fontSize: 7 },
  dataAmt:    { width: 60, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK_NAVY },
  dataAmtGrey:{ width: 60, textAlign: 'right', color: TEXT_MUTED },

  netPay:     { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 4,
                paddingBottom: 2, justifyContent: 'flex-end' },
  netLabel:   { color: '#059669', fontFamily: 'Helvetica-Bold', fontSize: 8, marginRight: 6 },
  netValue:   { color: DARK_NAVY, fontFamily: 'Helvetica-Bold', fontSize: 8.5 },

  divider:    { borderBottomWidth: 0.3, borderColor: BORDER, marginHorizontal: 10,
                marginTop: 4, marginBottom: 6 },

  subtotal:   { backgroundColor: '#f1f5f9', flexDirection: 'row', padding: 5,
                marginHorizontal: 10, marginBottom: 4 },
  subtotLabel:{ flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: DARK_NAVY },
  subtotAmt:  { width: 60, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK_NAVY },

  grandTotal: { backgroundColor: DARK_NAVY, flexDirection: 'row', padding: 7,
                marginHorizontal: 10, marginTop: 6 },
  gtLabel:    { flex: 1, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  gtAmt:      { width: 60, textAlign: 'right', color: 'white',
                fontFamily: 'Helvetica-Bold', fontSize: 9 },

  footer:     { position: 'absolute', bottom: 12, left: 12, right: 12,
                borderTopWidth: 0.5, borderColor: BORDER,
                flexDirection: 'row', alignItems: 'center', paddingTop: 6 },
  footerLogo: { width: 18, height: 18, backgroundColor: BANTU_GREEN, borderRadius: 3,
                justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  footerBrand:{ flex: 1, color: TEXT_MUTED, fontSize: 7, fontFamily: 'Helvetica-Bold',
                textAlign: 'center' },
  footerConf: { color: TEXT_MUTED, fontSize: 7, textAlign: 'right' },
});

const SummaryDocument = ({ data }) => {
  const { companyName, period, date, time, groups = [] } = data;

  let grandEarnings = 0, grandDeductions = 0, grandEmployer = 0, grandNet = 0;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header} fixed>
          <View>
            <Text style={s.company}>{(companyName || '').toUpperCase()}</Text>
            <Text style={s.meta}>Period: {period}</Text>
            <Text style={s.meta}>Generated: {date}  {time}</Text>
          </View>
          <Text style={s.title}>PAYROLL SUMMARY</Text>
        </View>

        {/* Column headers — each section mirrors the flex:1 colSection + dataRow padding structure */}
        <View style={s.colHdr} fixed>
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <Text style={[s.colHdrText, { flex: 1 }]}>EARNINGS</Text>
            <Text style={[s.colAmt, { width: 36 }]}>UNITS</Text>
            <Text style={[s.colAmt, { width: 60 }]}>AMOUNT</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <Text style={[s.colHdrText, { flex: 1 }]}>DEDUCTIONS</Text>
            <Text style={[s.colAmt, { width: 36 }]}>UNITS</Text>
            <Text style={[s.colAmt, { width: 60 }]}>AMOUNT</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <Text style={[s.colHdrText, { flex: 1 }]}>EMPLOYER CONTRIB.</Text>
            <Text style={[s.colAmt, { width: 60 }]}>AMOUNT</Text>
          </View>
        </View>

        {/* Groups */}
        {groups.map((group, gi) => {
          let groupEarnings = 0, groupDeductions = 0, groupEmployer = 0, groupNet = 0;

          return (
            <View key={gi}>
              <Text style={s.deptLabel}>{(group.name || 'General').toUpperCase()}</Text>

              {group.payslips.map((p, pi) => {
                const emp       = p.employee || {};
                const lines     = p.displayLines || [];
                const earnings  = lines.filter(l => (l.allowance ?? 0) > 0);
                const deductions= lines.filter(l => (l.deduction  ?? 0) > 0);
                const employers = lines.filter(l => (l.employer   ?? 0) > 0);
                const maxRows   = Math.max(earnings.length, deductions.length, employers.length, 1);

                const totalAllow = earnings.reduce((acc, e)  => acc + (e.allowance ?? 0), 0);
                const totalDed   = deductions.reduce((acc, d) => acc + (d.deduction ?? 0), 0);
                const totalEmpr  = employers.reduce((acc, r)  => acc + (r.employer  ?? 0), 0);
                const netPay     = p.netPay ?? (totalAllow - totalDed);
                const ccy        = p.currency || 'USD';

                groupEarnings   += totalAllow;
                groupDeductions += totalDed;
                groupEmployer   += totalEmpr;
                groupNet        += netPay;

                return (
                  <View key={pi} wrap={false}>
                    <Text style={s.empName}>
                      {emp.employeeCode}  {(emp.lastName || '').toUpperCase()}, {emp.firstName}
                    </Text>
                    <View style={s.threeCol}>
                      {/* Earnings column */}
                      <View style={s.colSection}>
                        {Array.from({ length: maxRows }).map((_, i) => {
                          const e = earnings[i];
                          return e ? (
                            <View key={i} style={s.dataRow}>
                              <Text style={s.dataDesc}>{e.name}</Text>
                              <Text style={s.dataUnits}>
                                {e.units != null ? `${e.units}${e.unitsType ? ' ' + e.unitsType : ''}` : ''}
                              </Text>
                              <Text style={s.dataAmt}>{fmt(e.allowance)}</Text>
                            </View>
                          ) : <View key={i} style={[s.dataRow, { height: 14 }]} />;
                        })}
                      </View>
                      {/* Deductions column */}
                      <View style={s.colSection}>
                        {Array.from({ length: maxRows }).map((_, i) => {
                          const d = deductions[i];
                          return d ? (
                            <View key={i} style={s.dataRow}>
                              <Text style={s.dataDesc}>{normalizeLabel(d.name)}</Text>
                              <Text style={s.dataUnits}>
                                {d.units != null ? `${d.units}${d.unitsType ? ' ' + d.unitsType : ''}` : ''}
                              </Text>
                              <Text style={s.dataAmt}>{fmt(d.deduction)}</Text>
                            </View>
                          ) : <View key={i} style={[s.dataRow, { height: 14 }]} />;
                        })}
                      </View>
                      {/* Employer column */}
                      <View style={{ flex: 1 }}>
                        {Array.from({ length: maxRows }).map((_, i) => {
                          const r = employers[i];
                          return r ? (
                            <View key={i} style={s.dataRow}>
                              <Text style={s.dataDesc}>{normalizeLabel(r.name)}</Text>
                              <Text style={s.dataAmtGrey}>{fmt(r.employer)}</Text>
                            </View>
                          ) : <View key={i} style={[s.dataRow, { height: 14 }]} />;
                        })}
                      </View>
                    </View>
                    {/* Net Pay line */}
                    <View style={s.netPay}>
                      <Text style={s.netLabel}>NET PAY</Text>
                      <Text style={s.netValue}>{ccy} {fmt(netPay)}</Text>
                    </View>
                    <View style={s.divider} />
                  </View>
                );
              })}

              {/* Group subtotal — accumulate into grand totals */}
              {(() => {
                grandEarnings   += groupEarnings;
                grandDeductions += groupDeductions;
                grandEmployer   += groupEmployer;
                grandNet        += groupNet;
                return (
                  <View style={s.subtotal} wrap={false}>
                    {/* Mirror 3-section layout so amounts align with data column headers */}
                    <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
                      <Text style={[s.subtotLabel, { flex: 1 }]}>SUBTOTAL — {(group.name || 'General').toUpperCase()}</Text>
                      <Text style={[s.subtotAmt, { width: 36 }]} />
                      <Text style={s.subtotAmt}>{fmt(groupEarnings)}</Text>
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
                      <View style={{ flex: 1 }} />
                      <Text style={[s.subtotAmt, { width: 36 }]} />
                      <Text style={s.subtotAmt}>{fmt(groupDeductions)}</Text>
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
                      <View style={{ flex: 1 }} />
                      <Text style={s.subtotAmt}>{fmt(groupEmployer)}</Text>
                    </View>
                  </View>
                );
              })()}
            </View>
          );
        })}

        {/* Grand Totals — mirror 3-section layout */}
        <View style={s.grandTotal} wrap={false}>
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <Text style={[s.gtLabel, { flex: 1 }]}>GRAND TOTALS</Text>
            <Text style={[s.gtAmt, { width: 36 }]} />
            <Text style={s.gtAmt}>{fmt(grandEarnings)}</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <View style={{ flex: 1 }} />
            <Text style={[s.gtAmt, { width: 36 }]} />
            <Text style={s.gtAmt}>{fmt(grandDeductions)}</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <View style={{ flex: 1 }} />
            <Text style={s.gtAmt}>{fmt(grandEmployer)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <View style={s.footerLogo}>
            <Text style={{ color: DARK_NAVY, fontSize: 8, fontFamily: 'Helvetica-Bold' }}>B</Text>
          </View>
          <Text style={s.footerBrand}>Bantu Modern HR &amp; Payroll Automation</Text>
          <Text style={s.footerConf}>CONFIDENTIAL DOCUMENT</Text>
        </View>

      </Page>
    </Document>
  );
};

export async function generatePayslipSummaryBuffer(data) {
  return renderToBuffer(<SummaryDocument data={data} />);
}

export async function generatePayslipSummaryPDF(data, res) {
  const buf = await generatePayslipSummaryBuffer(data);
  res.end(buf);
}
