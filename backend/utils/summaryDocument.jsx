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
const BLUE_ZIG    = '#0369a1';

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
  page: { fontFamily: 'Helvetica', fontSize: 7.5, paddingBottom: 50 },

  // Header
  header: { backgroundColor: DARK_NAVY, padding: 12, flexDirection: 'row',
             justifyContent: 'space-between', alignItems: 'flex-start' },
  company: { color: BANTU_GREEN, fontFamily: 'Helvetica-Bold', fontSize: 14 },
  meta: { color: 'white', fontSize: 8, marginTop: 3 },
  title: { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 20, textAlign: 'right' },

  // Department label bar
  deptLabel: { backgroundColor: '#d1dce8', paddingHorizontal: 10, paddingVertical: 5,
               marginTop: 10, fontFamily: 'Helvetica-Bold', fontSize: 9, color: DARK_NAVY,
               letterSpacing: 0.5 },

  // Per-employee header line
  empHeader: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 4,
               borderBottomWidth: 0.5, borderColor: BORDER, backgroundColor: '#f8fafc' },
  empHeaderField: { fontSize: 7.5, color: TEXT_MUTED, marginRight: 2 },
  empHeaderValue: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: DARK_NAVY, marginRight: 14 },

  // Two-column body
  twoCol: { flexDirection: 'row', marginHorizontal: 10 },
  colLeft: { flex: 1, borderRightWidth: 0.5, borderColor: BORDER },
  colRight: { flex: 1 },

  // Column sub-header (inside each employee block, per column)
  colSubHdr: { flexDirection: 'row', backgroundColor: '#eef2f7', paddingHorizontal: 4,
               paddingVertical: 3, borderBottomWidth: 0.3, borderColor: BORDER },
  colSubHdrLabel: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: DARK_NAVY },
  colSubHdrAmt: { width: 54, fontFamily: 'Helvetica-Bold', fontSize: 6.5,
                  textAlign: 'right', color: DARK_NAVY },
  colSubHdrAmtZIG: { width: 54, fontFamily: 'Helvetica-Bold', fontSize: 6.5,
                     textAlign: 'right', color: BLUE_ZIG },

  // Data rows
  dataRow: { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 1.8 },
  dataDesc: { flex: 1, color: TEXT_DARK, fontSize: 7.5 },
  dataDescCredit: { flex: 1, color: TEXT_MUTED, fontSize: 7, fontStyle: 'italic' },
  dataAmt: { width: 54, textAlign: 'right', fontFamily: 'Helvetica-Bold',
             color: DARK_NAVY, fontSize: 7.5 },
  dataAmtZIG: { width: 54, textAlign: 'right', fontFamily: 'Helvetica-Bold',
               color: BLUE_ZIG, fontSize: 7.5 },
  dataAmtMuted: { width: 54, textAlign: 'right', color: TEXT_MUTED, fontSize: 7 },

  // Employer contributions sub-section (right column, below deductions)
  empContrDivider: { borderTopWidth: 0.3, borderColor: BORDER, marginHorizontal: 4, marginTop: 3 },
  empContrLabel: { paddingHorizontal: 4, paddingTop: 2, paddingBottom: 1,
                   fontSize: 6, color: TEXT_MUTED, fontFamily: 'Helvetica-Bold' },

  // Employee totals row (underline beneath each column)
  empTotalRow: { flexDirection: 'row', borderTopWidth: 0.8, borderColor: DARK_NAVY,
                 paddingHorizontal: 4, paddingTop: 2, paddingBottom: 2 },
  empTotalLabel: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: DARK_NAVY },
  empTotalAmt: { width: 54, textAlign: 'right', fontFamily: 'Helvetica-Bold',
                 color: DARK_NAVY, fontSize: 7.5 },
  empTotalAmtZIG: { width: 54, textAlign: 'right', fontFamily: 'Helvetica-Bold',
                    color: BLUE_ZIG, fontSize: 7.5 },

  // Net pay row (right-column total section)
  netRow: { flexDirection: 'row', paddingHorizontal: 4, paddingTop: 3, paddingBottom: 3,
            backgroundColor: '#f0fdf4' },
  netLabel: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: '#059669' },
  netAmt: { width: 54, textAlign: 'right', fontFamily: 'Helvetica-Bold',
            color: '#059669', fontSize: 7.5 },
  netAmtZIG: { width: 54, textAlign: 'right', fontFamily: 'Helvetica-Bold',
               color: BLUE_ZIG, fontSize: 7.5 },

  // Department total footer bar
  deptTotalBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
                  paddingVertical: 5, backgroundColor: '#dde4ee', marginTop: 2,
                  borderTopWidth: 0.5, borderColor: '#b0bbcc' },
  deptTotalFor: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: DARK_NAVY },
  deptTotalEmps: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: DARK_NAVY, marginLeft: 10 },
  deptTotalSpacer: { flex: 1 },
  deptTotalNetLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: DARK_NAVY, marginRight: 6 },
  deptTotalAmt: { width: 60, textAlign: 'right', fontFamily: 'Helvetica-Bold',
                  color: DARK_NAVY, fontSize: 8 },
  deptTotalAmtZIG: { width: 60, textAlign: 'right', fontFamily: 'Helvetica-Bold',
                     color: BLUE_ZIG, fontSize: 8 },

  // Grand total
  grandTotal: { backgroundColor: DARK_NAVY, flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 },
  gtLabel: { flex: 1, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  gtNetLabel: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Helvetica-Bold',
                fontSize: 8, marginRight: 6 },
  gtAmt: { width: 64, textAlign: 'right', color: 'white',
           fontFamily: 'Helvetica-Bold', fontSize: 9 },
  gtAmtZIG: { width: 64, textAlign: 'right', color: BANTU_GREEN,
              fontFamily: 'Helvetica-Bold', fontSize: 9 },

  // Footer
  footer: { position: 'absolute', bottom: 12, left: 12, right: 12,
            borderTopWidth: 0.5, borderColor: BORDER,
            flexDirection: 'row', alignItems: 'center', paddingTop: 6 },
  footerLogo: { width: 22, height: 22, marginRight: 6 },
  footerBrand: { flex: 1, color: TEXT_MUTED, fontSize: 7, fontFamily: 'Helvetica-Bold',
                 textAlign: 'center' },
  footerConf: { color: TEXT_MUTED, fontSize: 7, textAlign: 'right' },
});

// ── Main Document ─────────────────────────────────────────────────────────────

const SummaryDocument = ({ data }) => {
  const { companyName, period, date, time, groups = [], isDual = false, exchangeRate, currency } = data;
  const ccy = isDual ? 'USD' : (currency || 'USD');

  // ── Pre-compute grand totals (line-item aggregation across all employees) ──
  const grandEarningsMap = new Map();
  const grandDeductionsMap = new Map();
  const grandEmployersMap = new Map();
  let grandNetUSD = 0, grandNetZIG = 0, grandHeadcount = 0;

  for (const group of groups) {
    grandHeadcount += group.payslips.length;
    for (const p of group.payslips) {
      const lines   = p.displayLines || [];
      const pIsDual = p.isDual ?? isDual;
      const earnings   = lines.filter(l => (l.allowance ?? 0) > 0);
      const deductions = lines.filter(l => (l.deduction ?? 0) > 0);
      const employers  = lines.filter(l => (l.employer  ?? 0) > 0);

      for (const e of earnings) {
        const ex = grandEarningsMap.get(e.name) || { usd: 0, zig: 0, taxCredit: !!e.taxCredit };
        ex.usd += e.allowance ?? 0;
        ex.zig += pIsDual ? (e.allowanceZIG ?? 0) : 0;
        grandEarningsMap.set(e.name, ex);
      }
      for (const d of deductions) {
        const key = normalizeLabel(d.name);
        const ex = grandDeductionsMap.get(key) || { usd: 0, zig: 0 };
        ex.usd += d.deduction ?? 0;
        ex.zig += pIsDual ? (d.deductionZIG ?? 0) : 0;
        grandDeductionsMap.set(key, ex);
      }
      for (const r of employers) {
        const key = normalizeLabel(r.name);
        const ex = grandEmployersMap.get(key) || { usd: 0 };
        ex.usd += r.employer ?? 0;
        grandEmployersMap.set(key, ex);
      }

      const earningsSumRows = earnings.filter(l => !l.taxCredit);
      const totalAllowUSD = earningsSumRows.reduce((a, e) => a + (e.allowance ?? 0), 0);
      const totalDedUSD   = deductions.reduce((a, d) => a + (d.deduction ?? 0), 0);
      grandNetUSD += p.netPayUSD ?? p.netPay ?? (totalAllowUSD - totalDedUSD);
      grandNetZIG += pIsDual ? (p.netPayZIG ?? 0) : 0;
    }
  }

  const grandEarningsLines   = Array.from(grandEarningsMap.entries()).map(([name, v]) => ({ name, ...v }));
  const grandDeductionsLines = Array.from(grandDeductionsMap.entries()).map(([name, v]) => ({ name, ...v }));
  const grandEmployersLines  = Array.from(grandEmployersMap.entries()).map(([name, v]) => ({ name, ...v }));
  const grandTotalEarningsUSD = grandEarningsLines.filter(l => !l.taxCredit).reduce((a, l) => a + l.usd, 0);
  const grandTotalEarningsZIG = grandEarningsLines.filter(l => !l.taxCredit).reduce((a, l) => a + l.zig, 0);
  const grandTotalDedUSD = grandDeductionsLines.reduce((a, l) => a + l.usd, 0);
  const grandTotalDedZIG = grandDeductionsLines.reduce((a, l) => a + l.zig, 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
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

        {/* ── Department Groups ── */}
        {groups.map((group, gi) => {
          let groupNetUSD = 0, groupNetZIG = 0;
          let groupEarningsUSD = 0, groupEarningsZIG = 0;
          let groupDeductionsUSD = 0, groupDeductionsZIG = 0;
          const groupHeadcount = group.payslips.length;

          return (
            <View key={gi}>
              {/* Department label */}
              <Text style={s.deptLabel}>{(group.name || 'General').toUpperCase()}</Text>

              {/* Employees */}
              {group.payslips.map((p, pi) => {
                const emp     = p.employee || {};
                const lines   = p.displayLines || [];
                const pIsDual = p.isDual ?? isDual;

                // Split lines into categories
                const earnings       = lines.filter(l => (l.allowance  ?? 0) > 0);
                const earningsSumRows= earnings.filter(l => !l.taxCredit);
                const deductions     = lines.filter(l => (l.deduction  ?? 0) > 0);
                const employers      = lines.filter(l => (l.employer   ?? 0) > 0);

                // Totals
                const totalAllowUSD = earningsSumRows.reduce((a, e) => a + (e.allowance   ?? 0), 0);
                const totalAllowZIG = pIsDual ? earningsSumRows.reduce((a, e) => a + (e.allowanceZIG ?? 0), 0) : 0;
                const totalDedUSD   = deductions.reduce((a, d) => a + (d.deduction  ?? 0), 0);
                const totalDedZIG   = pIsDual ? deductions.reduce((a, d) => a + (d.deductionZIG ?? 0), 0) : 0;
                const netUSD        = p.netPayUSD ?? p.netPay ?? (totalAllowUSD - totalDedUSD);
                const netZIG        = pIsDual ? (p.netPayZIG ?? 0) : 0;

                groupEarningsUSD   += totalAllowUSD;
                groupEarningsZIG   += totalAllowZIG;
                groupDeductionsUSD += totalDedUSD;
                groupDeductionsZIG += totalDedZIG;
                groupNetUSD        += netUSD;
                groupNetZIG        += netZIG;

                const deptName = emp.department?.name || p.employee?.costCenter || group.name || '';

                return (
                  <View key={pi} wrap={false}>
                    {/* Employee header line */}
                    <View style={s.empHeader}>
                      <Text style={s.empHeaderField}>CODE: </Text>
                      <Text style={s.empHeaderValue}>{emp.employeeCode || '—'}</Text>
                      <Text style={s.empHeaderField}>NAME: </Text>
                      <Text style={s.empHeaderValue}>
                        {(emp.lastName || '').toUpperCase()}{emp.firstName ? ', ' + emp.firstName : ''}
                      </Text>
                      <Text style={s.empHeaderField}>DEPARTMENT: </Text>
                      <Text style={s.empHeaderValue}>{(deptName || '').toUpperCase()}</Text>
                    </View>

                    {/* Two-column body */}
                    <View style={s.twoCol}>
                      {/* ── Left: Earnings ── */}
                      <View style={s.colLeft}>
                        <View style={s.colSubHdr}>
                          <Text style={s.colSubHdrLabel}>EARNINGS</Text>
                          <Text style={s.colSubHdrAmt}>{isDual ? 'USD' : ccy}</Text>
                          {pIsDual && <Text style={s.colSubHdrAmtZIG}>ZiG</Text>}
                        </View>
                        {earnings.map((e, i) => (
                          <View key={i} style={s.dataRow}>
                            <Text style={e.taxCredit ? s.dataDescCredit : s.dataDesc}>
                              {e.name}{e.taxCredit ? ' *' : ''}
                            </Text>
                            <Text style={e.taxCredit ? s.dataAmtMuted : s.dataAmt}>
                              {fmt(e.allowance)}
                            </Text>
                            {pIsDual && (
                              <Text style={e.taxCredit ? s.dataAmtMuted : s.dataAmtZIG}>
                                {(e.allowanceZIG ?? 0) !== 0 ? fmt(e.allowanceZIG) : '—'}
                              </Text>
                            )}
                          </View>
                        ))}
                        {earnings.length === 0 && (
                          <View style={[s.dataRow, { height: 14 }]} />
                        )}
                      </View>

                      {/* ── Right: Deductions + Employer ── */}
                      <View style={s.colRight}>
                        <View style={s.colSubHdr}>
                          <Text style={s.colSubHdrLabel}>DEDUCTIONS</Text>
                          <Text style={s.colSubHdrAmt}>{isDual ? 'USD' : ccy}</Text>
                          {pIsDual && <Text style={s.colSubHdrAmtZIG}>ZiG</Text>}
                        </View>
                        {deductions.map((d, i) => (
                          <View key={i} style={s.dataRow}>
                            <Text style={s.dataDesc}>{normalizeLabel(d.name)}</Text>
                            <Text style={s.dataAmt}>{fmt(d.deduction)}</Text>
                            {pIsDual && (
                              <Text style={s.dataAmtZIG}>
                                {(d.deductionZIG ?? 0) !== 0 ? fmt(d.deductionZIG) : '—'}
                              </Text>
                            )}
                          </View>
                        ))}
                        {deductions.length === 0 && (
                          <View style={[s.dataRow, { height: 14 }]} />
                        )}
                        {/* Employer contributions sub-section */}
                        {employers.length > 0 && (
                          <View>
                            <View style={s.empContrDivider} />
                            <Text style={s.empContrLabel}>EMPLOYER CONTRIBUTIONS</Text>
                            {employers.map((r, i) => (
                              <View key={i} style={s.dataRow}>
                                <Text style={[s.dataDesc, { color: TEXT_MUTED, fontSize: 7 }]}>
                                  {normalizeLabel(r.name)}
                                </Text>
                                <Text style={s.dataAmtMuted}>{fmt(r.employer)}</Text>
                                {pIsDual && <Text style={[s.dataAmtMuted, { width: 54 }]}>—</Text>}
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Totals row (aligned two halves) */}
                    <View style={s.twoCol}>
                      {/* Left total: total earnings */}
                      <View style={[s.colLeft, { borderRightWidth: 0.5, borderColor: BORDER }]}>
                        <View style={s.empTotalRow}>
                          <Text style={s.empTotalLabel}>TOTAL EARNINGS</Text>
                          <Text style={s.empTotalAmt}>{fmt(totalAllowUSD)}</Text>
                          {pIsDual && <Text style={s.empTotalAmtZIG}>{fmt(totalAllowZIG)}</Text>}
                        </View>
                      </View>
                      {/* Right total: total deductions + net pay */}
                      <View style={s.colRight}>
                        <View style={s.empTotalRow}>
                          <Text style={s.empTotalLabel}>TOTAL DEDUCTIONS</Text>
                          <Text style={s.empTotalAmt}>{fmt(totalDedUSD)}</Text>
                          {pIsDual && <Text style={s.empTotalAmtZIG}>{fmt(totalDedZIG)}</Text>}
                        </View>
                        <View style={s.netRow}>
                          <Text style={s.netLabel}>NET PAY</Text>
                          <Text style={s.netAmt}>{ccy} {fmt(netUSD)}</Text>
                          {pIsDual && netZIG > 0 && (
                            <Text style={s.netAmtZIG}>ZiG {fmt(netZIG)}</Text>
                          )}
                        </View>
                      </View>
                    </View>

                    {/* Spacer between employees */}
                    <View style={{ height: 4 }} />
                  </View>
                );
              })}

              {/* Department total footer */}
              <View style={s.deptTotalBar} wrap={false}>
                <Text style={s.deptTotalFor}>TOTAL FOR: {(group.name || 'General').toUpperCase()}</Text>
                <Text style={s.deptTotalEmps}>EMPLOYEES: {groupHeadcount}</Text>
                <View style={s.deptTotalSpacer} />
                <Text style={s.deptTotalNetLabel}>NET PAY:</Text>
                <Text style={s.deptTotalAmt}>{ccy} {fmt(groupNetUSD)}</Text>
                {isDual && groupNetZIG > 0 && (
                  <Text style={s.deptTotalAmtZIG}>ZiG {fmt(groupNetZIG)}</Text>
                )}
              </View>
            </View>
          );
        })}

        {/* ── Grand Totals Section ── */}
        <View style={s.grandTotal} wrap={false}>
          <Text style={s.gtLabel}>GRAND TOTALS</Text>
        </View>

        {/* Grand totals line-item breakdown */}
        <View style={s.twoCol} wrap={false}>
          {/* Left: aggregated earnings */}
          <View style={s.colLeft}>
            <View style={s.colSubHdr}>
              <Text style={s.colSubHdrLabel}>EARNINGS</Text>
              <Text style={s.colSubHdrAmt}>{isDual ? 'USD' : ccy}</Text>
              {isDual && <Text style={s.colSubHdrAmtZIG}>ZiG</Text>}
            </View>
            {grandEarningsLines.map((e, i) => (
              <View key={i} style={s.dataRow}>
                <Text style={e.taxCredit ? s.dataDescCredit : s.dataDesc}>
                  {e.name}{e.taxCredit ? ' *' : ''}
                </Text>
                <Text style={e.taxCredit ? s.dataAmtMuted : s.dataAmt}>{fmt(e.usd)}</Text>
                {isDual && (
                  <Text style={e.taxCredit ? s.dataAmtMuted : s.dataAmtZIG}>
                    {e.zig !== 0 ? fmt(e.zig) : '—'}
                  </Text>
                )}
              </View>
            ))}
          </View>

          {/* Right: aggregated deductions + employer */}
          <View style={s.colRight}>
            <View style={s.colSubHdr}>
              <Text style={s.colSubHdrLabel}>DEDUCTIONS</Text>
              <Text style={s.colSubHdrAmt}>{isDual ? 'USD' : ccy}</Text>
              {isDual && <Text style={s.colSubHdrAmtZIG}>ZiG</Text>}
            </View>
            {grandDeductionsLines.map((d, i) => (
              <View key={i} style={s.dataRow}>
                <Text style={s.dataDesc}>{d.name}</Text>
                <Text style={s.dataAmt}>{fmt(d.usd)}</Text>
                {isDual && (
                  <Text style={s.dataAmtZIG}>{d.zig !== 0 ? fmt(d.zig) : '—'}</Text>
                )}
              </View>
            ))}
            {grandEmployersLines.length > 0 && (
              <View>
                <View style={s.empContrDivider} />
                <Text style={s.empContrLabel}>EMPLOYER CONTRIBUTIONS</Text>
                {grandEmployersLines.map((r, i) => (
                  <View key={i} style={s.dataRow}>
                    <Text style={[s.dataDesc, { color: TEXT_MUTED, fontSize: 7 }]}>{r.name}</Text>
                    <Text style={s.dataAmtMuted}>{fmt(r.usd)}</Text>
                    {isDual && <Text style={[s.dataAmtMuted, { width: 54 }]}>—</Text>}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Grand totals summary row */}
        <View style={s.twoCol} wrap={false}>
          <View style={[s.colLeft, { borderRightWidth: 0.5, borderColor: BORDER }]}>
            <View style={s.empTotalRow}>
              <Text style={s.empTotalLabel}>TOTAL EARNINGS</Text>
              <Text style={s.empTotalAmt}>{fmt(grandTotalEarningsUSD)}</Text>
              {isDual && <Text style={s.empTotalAmtZIG}>{fmt(grandTotalEarningsZIG)}</Text>}
            </View>
          </View>
          <View style={s.colRight}>
            <View style={s.empTotalRow}>
              <Text style={s.empTotalLabel}>TOTAL DEDUCTIONS</Text>
              <Text style={s.empTotalAmt}>{fmt(grandTotalDedUSD)}</Text>
              {isDual && <Text style={s.empTotalAmtZIG}>{fmt(grandTotalDedZIG)}</Text>}
            </View>
            <View style={s.netRow}>
              <Text style={s.netLabel}>NET PAY</Text>
              <Text style={s.netAmt}>{ccy} {fmt(grandNetUSD)}</Text>
              {isDual && grandNetZIG > 0 && (
                <Text style={s.netAmtZIG}>ZiG {fmt(grandNetZIG)}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Total employees + end of report */}
        <View style={{ alignItems: 'center', paddingTop: 14, paddingBottom: 6 }} wrap={false}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, color: DARK_NAVY }}>
            TOTAL EMPLOYEES: {grandHeadcount}
          </Text>
          <Text style={{ fontSize: 8, color: TEXT_MUTED, marginTop: 6 }}>END OF REPORT...</Text>
        </View>

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
