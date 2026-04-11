import React from 'react';
import { createRequire } from 'module';
import { Document, Page, View, Text, StyleSheet, renderToBuffer, Image } from '@react-pdf/renderer';

const _require = createRequire(import.meta.url);
const LOGO_PATH = _require.resolve('./logo.svg');

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

// ── Styles ───────────────────────────────────────────────────────────────────
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
  colAmt:     { width: 55, color: 'white', fontFamily: 'Helvetica-Bold',
                fontSize: 7.5, textAlign: 'right' },
  colAmtSm:   { width: 50, color: 'rgba(178,219,100,0.85)', fontFamily: 'Helvetica-Bold',
                fontSize: 6.5, textAlign: 'right' },

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
  dataAmt:    { width: 55, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK_NAVY },
  dataAmtZIG: { width: 50, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: '#0369a1' },
  dataAmtGrey:{ width: 55, textAlign: 'right', color: TEXT_MUTED },

  netPay:     { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 4,
                paddingBottom: 2, gap: 16, justifyContent: 'flex-end' },
  netLabel:   { color: '#059669', fontFamily: 'Helvetica-Bold', fontSize: 8, marginRight: 4 },
  netValue:   { color: DARK_NAVY, fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  netValueZIG:{ color: '#0369a1', fontFamily: 'Helvetica-Bold', fontSize: 8, marginLeft: 6 },

  divider:    { borderBottomWidth: 0.3, borderColor: BORDER, marginHorizontal: 10,
                marginTop: 4, marginBottom: 6 },

  subtotal:   { backgroundColor: '#f1f5f9', flexDirection: 'row', padding: 5,
                marginHorizontal: 10, marginBottom: 4 },
  subtotLabel:{ flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: DARK_NAVY },
  subtotAmt:  { width: 55, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK_NAVY },
  subtotAmtZIG:{ width: 50, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: '#0369a1' },

  grandTotal: { backgroundColor: DARK_NAVY, flexDirection: 'row', padding: 7,
                marginHorizontal: 10, marginTop: 6 },
  gtLabel:    { flex: 1, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  gtAmt:      { width: 55, textAlign: 'right', color: 'white',
                fontFamily: 'Helvetica-Bold', fontSize: 9 },
  gtAmtZIG:   { width: 50, textAlign: 'right', color: BANTU_GREEN,
                fontFamily: 'Helvetica-Bold', fontSize: 9 },

  footer:     { position: 'absolute', bottom: 12, left: 12, right: 12,
                borderTopWidth: 0.5, borderColor: BORDER,
                flexDirection: 'row', alignItems: 'center', paddingTop: 6 },
  footerLogo: { width: 22, height: 22, marginRight: 6 },
  footerBrand:{ flex: 1, color: TEXT_MUTED, fontSize: 7, fontFamily: 'Helvetica-Bold',
                textAlign: 'center' },
  footerConf: { color: TEXT_MUTED, fontSize: 7, textAlign: 'right' },

  // Dual-currency currency badge labels
  ccyBadge:   { fontSize: 6, color: TEXT_MUTED, paddingHorizontal: 4, paddingTop: 2 },
});

// ── Main Document ─────────────────────────────────────────────────────────────

const SummaryDocument = ({ data }) => {
  const { companyName, period, date, time, groups = [], isDual = false, exchangeRate } = data;

  let grandEarningsUSD = 0, grandEarningsZIG = 0;
  let grandDeductionsUSD = 0, grandDeductionsZIG = 0;
  let grandEmployer = 0;
  let grandNetUSD = 0, grandNetZIG = 0;

  // Column header sub-labels for dual mode
  const AmtColHeader = ({ label }) => (
    <View style={{ flexDirection: 'row', gap: 0 }}>
      <Text style={[s.colAmt]}>{label}</Text>
      {isDual && <Text style={[s.colAmtSm]}>ZiG</Text>}
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header} fixed>
          <View>
            <Text style={s.company}>{(companyName || '').toUpperCase()}</Text>
            <Text style={s.meta}>Period: {period}</Text>
            <Text style={s.meta}>Generated: {date}  {time}</Text>
            {isDual && exchangeRate && (
              <Text style={[s.meta, { fontSize: 7, color: 'rgba(255,255,255,0.6)', marginTop: 2 }]}>
                Rate: 1 USD = {Number(exchangeRate).toFixed(4)} ZiG
              </Text>
            )}
          </View>
          <Text style={s.title}>PAYROLL SUMMARY</Text>
        </View>

        {/* Column headers */}
        <View style={s.colHdr} fixed>
          {/* Earnings section */}
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <Text style={[s.colHdrText, { flex: 1 }]}>EARNINGS</Text>
            {!isDual && <Text style={[s.colAmt, { width: 36 }]}>UNITS</Text>}
            <Text style={s.colAmt}>{isDual ? 'USD' : 'AMOUNT'}</Text>
            {isDual && <Text style={s.colAmtSm}>ZiG</Text>}
          </View>
          {/* Deductions section */}
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <Text style={[s.colHdrText, { flex: 1 }]}>DEDUCTIONS</Text>
            {!isDual && <Text style={[s.colAmt, { width: 36 }]}>UNITS</Text>}
            <Text style={s.colAmt}>{isDual ? 'USD' : 'AMOUNT'}</Text>
            {isDual && <Text style={s.colAmtSm}>ZiG</Text>}
          </View>
          {/* Employer section */}
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <Text style={[s.colHdrText, { flex: 1 }]}>EMPLOYER CONTRIB.</Text>
            <Text style={s.colAmt}>AMOUNT</Text>
          </View>
        </View>

        {/* Groups */}
        {groups.map((group, gi) => {
          let groupEarningsUSD = 0, groupEarningsZIG = 0;
          let groupDeductionsUSD = 0, groupDeductionsZIG = 0;
          let groupEmployer = 0;
          let groupNetUSD = 0, groupNetZIG = 0;

          return (
            <View key={gi}>
              <Text style={s.deptLabel}>{(group.name || 'General').toUpperCase()}</Text>

              {group.payslips.map((p, pi) => {
                const emp        = p.employee || {};
                const lines      = p.displayLines || [];
                const pIsDual    = p.isDual ?? isDual;
                const earnings   = lines.filter(l => (l.allowance ?? 0) > 0);
                const deductions = lines.filter(l => (l.deduction  ?? 0) > 0);
                const employers  = lines.filter(l => (l.employer   ?? 0) > 0);
                const maxRows    = Math.max(earnings.length, deductions.length, employers.length, 1);

                const totalAllowUSD = earnings.reduce((a, e) => a + (e.allowance ?? 0), 0);
                const totalAllowZIG = pIsDual ? earnings.reduce((a, e) => a + (e.allowanceZIG ?? 0), 0) : 0;
                const totalDedUSD   = deductions.reduce((a, d) => a + (d.deduction ?? 0), 0);
                const totalDedZIG   = pIsDual ? deductions.reduce((a, d) => a + (d.deductionZIG ?? 0), 0) : 0;
                const totalEmpr     = employers.reduce((a, r) => a + (r.employer ?? 0), 0);
                const netUSD        = p.netPayUSD ?? p.netPay ?? (totalAllowUSD - totalDedUSD);
                const netZIG        = pIsDual ? (p.netPayZIG ?? 0) : 0;

                groupEarningsUSD   += totalAllowUSD;
                groupEarningsZIG   += totalAllowZIG;
                groupDeductionsUSD += totalDedUSD;
                groupDeductionsZIG += totalDedZIG;
                groupEmployer      += totalEmpr;
                groupNetUSD        += netUSD;
                groupNetZIG        += netZIG;

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
                              {!pIsDual && (
                                <Text style={s.dataUnits}>
                                  {e.units != null ? `${e.units}${e.unitsType ? ' ' + e.unitsType : ''}` : ''}
                                </Text>
                              )}
                              <Text style={s.dataAmt}>{fmt(e.allowance)}</Text>
                              {pIsDual && (
                                <Text style={s.dataAmtZIG}>
                                  {(e.allowanceZIG ?? 0) !== 0 ? fmt(e.allowanceZIG) : '—'}
                                </Text>
                              )}
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
                              {!pIsDual && (
                                <Text style={s.dataUnits}>
                                  {d.units != null ? `${d.units}${d.unitsType ? ' ' + d.unitsType : ''}` : ''}
                                </Text>
                              )}
                              <Text style={s.dataAmt}>{fmt(d.deduction)}</Text>
                              {pIsDual && (
                                <Text style={s.dataAmtZIG}>
                                  {(d.deductionZIG ?? 0) !== 0 ? fmt(d.deductionZIG) : '—'}
                                </Text>
                              )}
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
                      <Text style={s.netValue}>USD {fmt(netUSD)}</Text>
                      {pIsDual && netZIG > 0 && (
                        <Text style={s.netValueZIG}>ZiG {fmt(netZIG)}</Text>
                      )}
                    </View>
                    <View style={s.divider} />
                  </View>
                );
              })}

              {/* Group subtotal */}
              {(() => {
                grandEarningsUSD   += groupEarningsUSD;
                grandEarningsZIG   += groupEarningsZIG;
                grandDeductionsUSD += groupDeductionsUSD;
                grandDeductionsZIG += groupDeductionsZIG;
                grandEmployer      += groupEmployer;
                grandNetUSD        += groupNetUSD;
                grandNetZIG        += groupNetZIG;
                return (
                  <View style={s.subtotal} wrap={false}>
                    <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
                      <Text style={[s.subtotLabel, { flex: 1 }]}>SUBTOTAL — {(group.name || 'General').toUpperCase()}</Text>
                      {!isDual && <Text style={[s.subtotAmt, { width: 36 }]} />}
                      <Text style={s.subtotAmt}>{fmt(groupEarningsUSD)}</Text>
                      {isDual && <Text style={s.subtotAmtZIG}>{fmt(groupEarningsZIG)}</Text>}
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
                      <View style={{ flex: 1 }} />
                      {!isDual && <Text style={[s.subtotAmt, { width: 36 }]} />}
                      <Text style={s.subtotAmt}>{fmt(groupDeductionsUSD)}</Text>
                      {isDual && <Text style={s.subtotAmtZIG}>{fmt(groupDeductionsZIG)}</Text>}
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

        {/* Grand Totals */}
        <View style={s.grandTotal} wrap={false}>
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <Text style={[s.gtLabel, { flex: 1 }]}>GRAND TOTALS</Text>
            {!isDual && <Text style={[s.gtAmt, { width: 36 }]} />}
            <Text style={s.gtAmt}>{fmt(grandEarningsUSD)}</Text>
            {isDual && <Text style={s.gtAmtZIG}>{fmt(grandEarningsZIG)}</Text>}
          </View>
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <View style={{ flex: 1 }} />
            {!isDual && <Text style={[s.gtAmt, { width: 36 }]} />}
            <Text style={s.gtAmt}>{fmt(grandDeductionsUSD)}</Text>
            {isDual && <Text style={s.gtAmtZIG}>{fmt(grandDeductionsZIG)}</Text>}
          </View>
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <View style={{ flex: 1 }} />
            <Text style={s.gtAmt}>{fmt(grandEmployer)}</Text>
          </View>
        </View>

        {/* Net Pay grand total for dual */}
        {isDual && (
          <View style={{ flexDirection: 'row', paddingHorizontal: 15, paddingTop: 6, justifyContent: 'flex-end', gap: 20 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, color: DARK_NAVY }}>
              GRAND NET PAY:  USD {fmt(grandNetUSD)}
            </Text>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#0369a1' }}>
              ZiG {fmt(grandNetZIG)}
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Image src={LOGO_PATH} style={s.footerLogo} />
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
