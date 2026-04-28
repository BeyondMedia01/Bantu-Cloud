import React from 'react';
import { createRequire } from 'module';
import {
  Document, Page, View, Text, StyleSheet, renderToBuffer, Image
} from '@react-pdf/renderer';

const _require = createRequire(import.meta.url);
const LOGO_PATH = _require.resolve('./logo.svg');

// ── Design tokens ────────────────────────────────────────────────────────────
const DARK_NAVY   = '#1a2e4a';
const BANTU_GREEN = '#B2DB64';
const TEXT_DARK   = '#1e293b';
const TEXT_MUTED  = '#64748b';
const BG_LIGHT    = '#f8fafc';
const BORDER      = '#e2e8f0';
const RED         = '#dc2626';
const NAVY_LIGHT  = '#1e3a5f';

const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => `USD ${fmt(n)}`;

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 8, paddingBottom: 65 },

  // Header
  header:      { backgroundColor: DARK_NAVY, padding: 12, flexDirection: 'row',
                 justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft:  { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  logoBox:     { width: 42, height: 42, backgroundColor: BANTU_GREEN,
                 borderRadius: 4, marginRight: 10, justifyContent: 'center',
                 alignItems: 'center' },
  logoText:    { color: DARK_NAVY, fontSize: 10, fontFamily: 'Helvetica-Bold' },
  company:     { color: BANTU_GREEN, fontFamily: 'Helvetica-Bold', fontSize: 14 },
  periodText:  { color: 'white', fontSize: 8, marginTop: 3 },
  payslipTitle:{ color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 20,
                 textAlign: 'right' },
  // Leave bar (below bank bar)
  leaveBar:    { backgroundColor: '#edf7e3', marginHorizontal: 10, marginTop: 5,
                 padding: 8, flexDirection: 'row', alignItems: 'center',
                 borderWidth: 0.5, borderColor: '#c3e6a0' },
  leaveBlock:  { flex: 1 },
  leaveLabel:  { color: TEXT_MUTED, fontSize: 6, fontFamily: 'Helvetica-Bold',
                 textTransform: 'uppercase' },
  leaveValue:  { color: DARK_NAVY, fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  leaveDivider:{ width: 0.5, backgroundColor: '#c3e6a0', height: 28, marginHorizontal: 10 },

  // Employee card
  card:        { backgroundColor: BG_LIGHT, borderRadius: 5, padding: 10,
                 marginHorizontal: 10, marginTop: 6,
                 borderWidth: 0.5, borderColor: BORDER },
  cardRow:     { flexDirection: 'row', marginBottom: 6 },
  fieldBlock:  { flex: 1 },
  fieldLabel:  { color: TEXT_MUTED, fontSize: 6, fontFamily: 'Helvetica-Bold',
                 textTransform: 'uppercase' },
  fieldValue:  { color: TEXT_DARK, fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginTop: 2 },

  // Bank bar
  bankBar:     { backgroundColor: '#edf2f7', marginHorizontal: 10, marginTop: 5,
                 padding: 8, flexDirection: 'row',
                 borderWidth: 0.5, borderColor: BORDER },

  // Tables
  tables:      { flexDirection: 'row', marginHorizontal: 10, marginTop: 5, gap: 5 },
  tableHalf:   { flex: 1 },
  tableHeader: { backgroundColor: DARK_NAVY, padding: 5, paddingBottom: 4 },
  tableTitle:  { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  subHeaders:  { flexDirection: 'row', marginTop: 3 },
  subHdrDesc:  { flex: 1, color: 'rgba(255,255,255,0.65)', fontSize: 6.5, fontFamily: 'Helvetica-Bold' },
  subHdrUnits: { width: 38, color: 'rgba(255,255,255,0.65)', fontSize: 6.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  subHdrAmt:   { width: 65, color: 'rgba(255,255,255,0.65)', fontSize: 6.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  subHdrAmtZIG:{ width: 58, color: 'rgba(178,219,100,0.9)', fontSize: 6.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  subHdrYtd:   { width: 52, color: 'rgba(255,255,255,0.65)', fontSize: 6.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  tableRow:    { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 5 },
  rowEven:     { backgroundColor: '#f7f9fc' },
  rowDesc:     { flex: 1, color: TEXT_DARK, fontSize: 8, lineHeight: 1.2 },
  rowSubDesc:  { flex: 1, color: TEXT_MUTED, fontSize: 6, marginTop: 1 },
  rowUnits:    { width: 38, fontSize: 7.5, textAlign: 'right', color: TEXT_MUTED,
                 fontFamily: 'Courier', lineHeight: 1.2 },
  rowAmt:      { width: 65, fontFamily: 'Courier-Bold', fontSize: 7.5,
                 textAlign: 'right', color: DARK_NAVY, lineHeight: 1.2 },
  rowAmtZIG:   { width: 58, fontFamily: 'Courier-Bold', fontSize: 7.5,
                 textAlign: 'right', color: '#0369a1', lineHeight: 1.2 },
  rowYtd:      { width: 52, fontFamily: 'Courier', fontSize: 7, textAlign: 'right',
                 color: TEXT_MUTED, lineHeight: 1.2 },

  // Employer contributions
  empSection:  { marginHorizontal: 10, marginTop: 5 },
  empHeader:   { backgroundColor: NAVY_LIGHT, padding: 5, paddingBottom: 4 },
  empTitle:    { color: '#a5b4fc', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  empSubHdrs:  { flexDirection: 'row', marginTop: 3 },
  empRow:      { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 5 },
  empRowDesc:  { flex: 1, color: TEXT_DARK, fontSize: 8, lineHeight: 1.2 },
  empRowAmt:   { width: 72, fontFamily: 'Courier-Bold', fontSize: 7.5,
                 textAlign: 'right', color: '#3730a3', lineHeight: 1.2 },
  empRowYtd:   { width: 58, fontFamily: 'Courier', fontSize: 7, textAlign: 'right',
                 color: TEXT_MUTED, lineHeight: 1.2 },

  // YTD block
  ytdSection:  { marginHorizontal: 10, marginTop: 5 },
  ytdHeader:   { backgroundColor: '#2d3748', padding: 5, paddingBottom: 4 },
  ytdTitle:    { color: '#fbbf24', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  ytdSubHdrs:  { flexDirection: 'row', marginTop: 3 },
  ytdRow:      { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 5 },
  ytdRowDesc:  { flex: 1, color: TEXT_DARK, fontSize: 8, lineHeight: 1.2 },
  ytdRowUSD:   { width: 72, fontFamily: 'Courier-Bold', fontSize: 7.5,
                 textAlign: 'right', color: DARK_NAVY, lineHeight: 1.2 },
  ytdRowZIG:   { width: 72, fontFamily: 'Courier-Bold', fontSize: 7.5,
                 textAlign: 'right', color: '#0369a1', lineHeight: 1.2 },
  ytdGroupLabel:{ flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 5,
                  backgroundColor: '#e8edf3' },
  ytdGroupText: { flex: 1, color: TEXT_MUTED, fontSize: 6.5,
                  fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },

  // Summary ribbon — 3 boxes
  ribbon:      { flexDirection: 'row', marginHorizontal: 10, marginTop: 5, gap: 4 },
  ribbonBox:   { flex: 1, padding: 10, borderRadius: 3 },
  ribbonLabel: { fontSize: 6.5, marginBottom: 6 },
  ribbonAmt:   { fontFamily: 'Helvetica-Bold', fontSize: 11, textAlign: 'right' },
  ribbonAmtLg: { fontFamily: 'Helvetica-Bold', fontSize: 14, textAlign: 'right' },

  // Footer (absolute, always at bottom)
  footer:      { position: 'absolute', bottom: 12, left: 12, right: 12,
                 borderTopWidth: 0.5, borderColor: BORDER,
                 flexDirection: 'row', alignItems: 'center', paddingTop: 6 },
  footerLogo:  { width: 22, height: 22, marginRight: 6 },
  footerBrand: { flex: 1, color: TEXT_MUTED, fontSize: 7, fontFamily: 'Helvetica-Bold',
                 textAlign: 'center' },
  footerConf:  { color: TEXT_MUTED, fontSize: 7, textAlign: 'right' },
});

// ── Sub-components ───────────────────────────────────────────────────────────

const Field = ({ label, value, style }) => (
  <View style={[s.fieldBlock, style]}>
    <Text style={s.fieldLabel}>{label}</Text>
    <Text style={s.fieldValue}>{value || '—'}</Text>
  </View>
);

// Column flex ratios inside each half-table:
// Dual:   DESCRIPTION(flex:2) | UNITS(flex:0.55) | USD(flex:1) | ZiG(flex:1)
// Single: DESCRIPTION(flex:2) | UNITS(flex:0.55) | AMOUNT(flex:1.4)

const TableSection = ({ title, titleColor, rows, getAmt, getAmtZIG, isDual }) => (
  <View style={s.tableHalf}>
    <View style={s.tableHeader}>
      <Text style={[s.tableTitle, { color: titleColor }]}>{title}</Text>
      <View style={[s.subHeaders, { flexWrap: 'nowrap' }]}>
        <Text style={[s.subHdrDesc, { flex: 2 }]}>DESCRIPTION</Text>
        <Text style={[s.subHdrUnits, { flex: 0.55 }]}>UNITS</Text>
        <Text style={[s.subHdrAmt, { flex: isDual ? 1 : 1.4, width: undefined }]}>{isDual ? 'USD' : 'AMOUNT'}</Text>
        {isDual && <Text style={[s.subHdrAmtZIG, { flex: 1, width: undefined }]}>ZiG</Text>}
      </View>
    </View>
    {rows.map((item, idx) => {
      const usdAmt = getAmt(item);
      const zigAmt = isDual ? getAmtZIG(item) : null;
      return (
        <View key={idx} style={[s.tableRow, { flexWrap: 'nowrap' }, idx % 2 === 0 ? s.rowEven : {}]}>
          <View style={{ flex: 2 }}>
            <Text style={[s.rowDesc, { flexWrap: 'nowrap' }]} numberOfLines={2}>{item.name}</Text>
            {item.description ? <Text style={s.rowSubDesc}>{item.description}</Text> : null}
          </View>
          <Text style={[s.rowUnits, { flex: 0.55, width: undefined }]} numberOfLines={1}>
            {item.units != null ? `${item.units}${item.unitsType ? ' ' + item.unitsType : ''}` : ''}
          </Text>
          <Text style={[s.rowAmt, { flex: isDual ? 1 : 1.4, width: undefined }]} numberOfLines={1}>{isDual && (usdAmt == null || usdAmt === 0) ? '—' : usd(usdAmt)}</Text>
          {isDual && (
            <Text style={[s.rowAmtZIG, { flex: 1, width: undefined }]} numberOfLines={1}>
              {zigAmt != null && zigAmt !== 0 ? `ZiG ${fmt(zigAmt)}` : '—'}
            </Text>
          )}
        </View>
      );
    })}
  </View>
);

// ── Main Document Component ──────────────────────────────────────────────────

const PayslipDocument = ({ data }) => {
  const {
    companyName, period, issuedDate, employeeName, employeeCode, nationalId,
    jobTitle, department, costCenter, paymentMethod, bankName, accountNumber,
    currency, lineItems = [], grossPay, totalDeductions, netSalary,
    netPayUSD, netPayZIG,
    grossUSD, grossZIG,
    exchangeRate,
    leaveBalance, leaveTaken,
  } = data;

  const isDual = grossUSD != null && grossZIG != null;

  const earnings   = lineItems.filter(i => (i.allowance ?? 0) > 0 || (i.allowanceZIG ?? 0) > 0);
  const deductions = lineItems.filter(i => (i.deduction  ?? 0) > 0 || (i.deductionZIG  ?? 0) > 0);
  const employers  = lineItems.filter(i => (i.employer   ?? 0) > 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Section 1: Identity Header ─────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Image src={LOGO_PATH} style={s.logoBox} />
            <View>
              <Text style={s.company}>{(companyName || '').toUpperCase()}</Text>
              <Text style={s.periodText}>Period: {period}</Text>
              <Text style={s.periodText}>Issued: {issuedDate}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.payslipTitle}>PAYSLIP</Text>
          </View>
        </View>

        {/* ── Section 2: Employee & Job Details Card ─────────────────── */}
        <View style={s.card}>
          <View style={s.cardRow}>
            <Field label="Employee Name" value={employeeName} style={{ flex: 1.5 }} />
            <Field label="Employee Code" value={employeeCode} />
            <Field label="ID Number"     value={nationalId}   style={{ flex: 1.5 }} />
          </View>
          <View style={[s.cardRow, { marginBottom: 0 }]}>
            <Field label="Department"  value={department} />
            <Field label="Position"    value={jobTitle} />
            <Field label="Cost Centre" value={costCenter} />
            <Field label="Pay Method"  value={paymentMethod} />
          </View>
        </View>

        {/* ── Section 3: Payment Destination Bar ─────────────────────── */}
        <View style={s.bankBar}>
          <Field label="Bank Name"      value={bankName}      style={{ flex: 1 }} />
          <Field label="Account Number" value={accountNumber} style={{ flex: 1 }} />
        </View>

        {/* ── Section 3b: Leave Balance Bar ───────────────────────────── */}
        <View style={s.leaveBar}>
          <View style={s.leaveBlock}>
            <Text style={s.leaveLabel}>Annual Leave Balance</Text>
            <Text style={s.leaveValue}>{(leaveBalance || 0).toFixed(1)} days</Text>
          </View>
          <View style={s.leaveDivider} />
          <View style={s.leaveBlock}>
            <Text style={s.leaveLabel}>Leave Taken (YTD)</Text>
            <Text style={s.leaveValue}>{(leaveTaken || 0).toFixed(1)} days</Text>
          </View>
        </View>

        {/* ── Section 4: Side-by-Side Financial Tables ───────────────── */}
        <View style={s.tables}>
          <TableSection
            title="EARNINGS" titleColor={BANTU_GREEN}
            rows={earnings}
            getAmt={e => e.allowance}
            getAmtZIG={e => e.allowanceZIG}
            isDual={isDual}
          />
          <TableSection
            title="DEDUCTIONS" titleColor="#fb7185"
            rows={deductions}
            getAmt={d => d.deduction}
            getAmtZIG={d => d.deductionZIG}
            isDual={isDual}
          />
        </View>

        {/* ── Section 5: Employer Contributions ──────────────────────── */}
        {employers.length > 0 && (
          <View style={s.empSection}>
            <View style={s.empHeader}>
              <Text style={s.empTitle}>STATUTORY EMPLOYER CONTRIBUTIONS</Text>
              <View style={[s.empSubHdrs, { flexWrap: 'nowrap' }]}>
                <Text style={[s.subHdrDesc, { flex: 2 }]}>DESCRIPTION</Text>
                <Text style={[s.subHdrAmt, { flex: 1, width: undefined, textAlign: 'right' }]}>AMOUNT (USD)</Text>
                <Text style={[s.subHdrYtd, { flex: 1, width: undefined, textAlign: 'right' }]}>YTD (USD)</Text>
              </View>
            </View>
            {employers.map((c, idx) => (
              <View key={idx} style={[s.empRow, { flexWrap: 'nowrap' }, idx % 2 === 0 ? { backgroundColor: '#f0f4ff' } : {}]}>
                <Text style={[s.empRowDesc, { flex: 2 }]} numberOfLines={2}>{c.name}</Text>
                <Text style={[s.empRowAmt, { flex: 1, width: undefined }]} numberOfLines={1}>{usd(c.employer)}</Text>
                {c.ytd != null && <Text style={[s.empRowYtd, { flex: 1, width: undefined }]} numberOfLines={1}>{usd(c.ytd)}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* ── Section 5b: YTD Summary Block ──────────────────────────── */}
        <View style={s.ytdSection}>
          <View style={s.ytdHeader}>
            <Text style={s.ytdTitle}>YEAR-TO-DATE SUMMARY</Text>
            <View style={[s.ytdSubHdrs, { flexWrap: 'nowrap' }]}>
              <Text style={[s.subHdrDesc, { flex: 2 }]}>DESCRIPTION</Text>
              <Text style={[s.subHdrAmt, { flex: 1, width: undefined, textAlign: 'right' }]}>YTD (USD)</Text>
              {isDual && <Text style={[s.subHdrAmtZIG, { flex: 1, width: undefined, textAlign: 'right' }]}>YTD (ZiG)</Text>}
            </View>
          </View>
          {/* Earnings group */}
          <View style={s.ytdGroupLabel}>
            <Text style={s.ytdGroupText}>Earnings</Text>
          </View>
          {earnings.map((item, idx) => (
            <View key={`ye-${idx}`} style={[s.ytdRow, { flexWrap: 'nowrap' }, idx % 2 === 0 ? { backgroundColor: '#f7f9fc' } : {}]}>
              <Text style={[s.ytdRowDesc, { flex: 2 }]} numberOfLines={2}>{item.name}</Text>
              <Text style={[s.ytdRowUSD, { flex: 1, width: undefined }]} numberOfLines={1}>{usd(item.ytd ?? item.allowance)}</Text>
              {isDual && (
                <Text style={[s.ytdRowZIG, { flex: 1, width: undefined }]} numberOfLines={1}>
                  {item.ytdZIG != null ? `ZiG ${fmt(item.ytdZIG)}` : '—'}
                </Text>
              )}
            </View>
          ))}
          {/* Deductions group */}
          <View style={s.ytdGroupLabel}>
            <Text style={s.ytdGroupText}>Deductions</Text>
          </View>
          {deductions.map((item, idx) => (
            <View key={`yd-${idx}`} style={[s.ytdRow, { flexWrap: 'nowrap' }, idx % 2 === 0 ? { backgroundColor: '#f7f9fc' } : {}]}>
              <Text style={[s.ytdRowDesc, { flex: 2 }]} numberOfLines={2}>{item.name}</Text>
              <Text style={[s.ytdRowUSD, { flex: 1, width: undefined }]} numberOfLines={1}>{isDual && !(item.ytd ?? item.deduction) ? '—' : usd(item.ytd ?? item.deduction)}</Text>
              {isDual && (
                <Text style={[s.ytdRowZIG, { flex: 1, width: undefined }]} numberOfLines={1}>
                  {item.ytdZIG != null ? `ZiG ${fmt(item.ytdZIG)}` : '—'}
                </Text>
              )}
            </View>
          ))}
        </View>

        {/* ── Section 6: Three-Box Summary Ribbon ────────────────────── */}
        <View style={s.ribbon}>
          {/* Box 1 — Total Earnings */}
          <View style={[s.ribbonBox, { backgroundColor: DARK_NAVY }]}>
            <Text style={[s.ribbonLabel, { color: 'rgba(255,255,255,0.7)' }]}>TOTAL EARNINGS</Text>
            {isDual ? (
              <>
                <Text style={[s.ribbonAmt, { color: 'white', fontSize: 11 }]}>USD {fmt(grossUSD)}</Text>
                <Text style={[s.ribbonAmt, { color: 'rgba(255,255,255,0.8)', fontSize: 9, marginTop: 2 }]}>ZiG {fmt(grossZIG)}</Text>
              </>
            ) : (
              <Text style={[s.ribbonAmtLg, { color: 'white' }]}>{usd(grossPay)}</Text>
            )}
          </View>
          {/* Box 2 — Total Deductions */}
          <View style={[s.ribbonBox, { backgroundColor: '#f1f5f9' }]}>
            <Text style={[s.ribbonLabel, { color: TEXT_MUTED }]}>TOTAL DEDUCTIONS</Text>
            {isDual ? (
              <>
                <Text style={[s.ribbonAmt, { color: RED, fontSize: 11 }]}>USD {fmt((grossUSD ?? 0) - (netPayUSD ?? 0))}</Text>
                <Text style={[s.ribbonAmt, { color: RED, fontSize: 9, marginTop: 2 }]}>ZiG {fmt((grossZIG ?? 0) - (netPayZIG ?? 0))}</Text>
              </>
            ) : (
              <Text style={[s.ribbonAmt, { color: RED }]}>{usd(totalDeductions)}</Text>
            )}
          </View>
          {/* Box 3 — Net Salary */}
          <View style={[s.ribbonBox, { backgroundColor: BANTU_GREEN }]}>
            <Text style={[s.ribbonLabel, { color: DARK_NAVY, fontFamily: 'Helvetica-Bold' }]}>NET SALARY</Text>
            {isDual ? (
              <>
                <Text style={[s.ribbonAmt, { color: DARK_NAVY, fontSize: 11 }]}>USD {fmt(netPayUSD)}</Text>
                <Text style={[s.ribbonAmt, { color: DARK_NAVY, fontSize: 9, marginTop: 2 }]}>ZiG {fmt(netPayZIG)}</Text>
              </>
            ) : (
              <Text style={[s.ribbonAmtLg, { color: DARK_NAVY }]}>{usd(netSalary)}</Text>
            )}
          </View>
        </View>

        {/* Exchange rate footnote for dual/ZiG runs */}
        {exchangeRate != null && exchangeRate !== 1 && (
          <View style={{ marginHorizontal: 10, marginTop: 3 }}>
            <Text style={{ fontSize: 6, color: TEXT_MUTED }}>
              Exchange rate applied: 1 USD = {Number(exchangeRate).toFixed(4)} ZiG
            </Text>
          </View>
        )}

        {/* ── Section 7: Footer (absolute, always at page bottom) ─────── */}
        <View style={s.footer} fixed>
          <Image src={LOGO_PATH} style={s.footerLogo} />
          <Text style={s.footerBrand}>Bantu Modern HR &amp; Payroll Automation</Text>
          <Text style={s.footerConf}>CONFIDENTIAL DOCUMENT</Text>
        </View>

      </Page>
    </Document>
  );
};

// ── Public API ───────────────────────────────────────────────────────────────

export async function generatePayslipBuffer(data) {
  if (data.bankMissing) {
    const err = new Error(
      `Bank details incomplete for ${data.employeeName || 'employee'}. ` +
      'Both Bank Name and Account Number must be set before generating a payslip.'
    );
    err.code = 'BANK_DETAILS_MISSING';
    throw err;
  }
  return renderToBuffer(<PayslipDocument data={data} />);
}

export async function generatePayslipPDF(data, stream) {
  const buf = await generatePayslipBuffer(data);
  stream.end(buf);
}
