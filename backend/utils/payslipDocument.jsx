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
  tableHeader: { backgroundColor: DARK_NAVY, padding: 5, paddingBottom: 3 },
  tableTitle:  { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  subHeaders:  { flexDirection: 'row', marginTop: 4 },
  subHdrDesc:  { flex: 1, color: 'rgba(255,255,255,0.65)', fontSize: 6 },
  subHdrUnits: { width: 38, color: 'rgba(255,255,255,0.65)', fontSize: 6, textAlign: 'right' },
  subHdrAmt:   { width: 65, color: 'rgba(255,255,255,0.65)', fontSize: 6, textAlign: 'right' },
  subHdrYtd:   { width: 52, color: 'rgba(255,255,255,0.65)', fontSize: 6, textAlign: 'right' },
  tableRow:    { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 5 },
  rowEven:     { backgroundColor: '#f7f9fc' },
  rowDesc:     { flex: 1, color: TEXT_DARK, fontSize: 7.5 },
  rowSubDesc:  { flex: 1, color: TEXT_MUTED, fontSize: 6, marginTop: 1 },
  rowUnits:    { width: 38, fontSize: 7, textAlign: 'right', color: TEXT_MUTED },
  rowAmt:      { width: 65, fontFamily: 'Helvetica-Bold', fontSize: 7.5,
                 textAlign: 'right', color: DARK_NAVY },
  rowYtd:      { width: 52, fontSize: 7, textAlign: 'right', color: TEXT_MUTED },

  // Employer contributions
  empSection:  { marginHorizontal: 10, marginTop: 5 },
  empHeader:   { backgroundColor: NAVY_LIGHT, padding: 5, paddingBottom: 3 },
  empTitle:    { color: '#a5b4fc', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  empSubHdrs:  { flexDirection: 'row', marginTop: 4 },
  empRow:      { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 5 },
  empRowDesc:  { flex: 1, color: TEXT_DARK, fontSize: 7.5 },
  empRowAmt:   { width: 72, fontFamily: 'Helvetica-Bold', fontSize: 7.5,
                 textAlign: 'right', color: '#3730a3' },
  empRowYtd:   { width: 58, fontSize: 7, textAlign: 'right', color: TEXT_MUTED },

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

const TableSection = ({ title, titleColor, rows, getAmt, getAmtZIG, getYtd, isDual }) => (
  <View style={s.tableHalf}>
    <View style={s.tableHeader}>
      <Text style={[s.tableTitle, { color: titleColor }]}>{title}</Text>
      <View style={s.subHeaders}>
        <Text style={s.subHdrDesc}>DESCRIPTION</Text>
        <Text style={s.subHdrUnits}>UNITS</Text>
        <Text style={[s.subHdrAmt, isDual ? { width: 80 } : {}]}>{isDual ? 'USD / ZiG' : 'AMOUNT'}</Text>
        <Text style={s.subHdrYtd}>YTD</Text>
      </View>
    </View>
    {rows.map((item, idx) => {
      const usdAmt = getAmt(item);
      const zigAmt = isDual ? getAmtZIG(item) : null;
      return (
        <View key={idx} style={[s.tableRow, idx % 2 === 0 ? s.rowEven : {}]}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowDesc}>{item.name}</Text>
            {item.description ? <Text style={s.rowSubDesc}>{item.description}</Text> : null}
          </View>
          <Text style={s.rowUnits}>
            {item.units != null ? `${item.units}${item.unitsType ? ' ' + item.unitsType : ''}` : ''}
          </Text>
          <View style={[s.rowAmt, isDual ? { width: 80, alignItems: 'flex-end' } : {}]}>
            <Text style={[s.rowAmt, { width: undefined }]}>{usd(usdAmt)}</Text>
            {isDual && zigAmt != null && zigAmt !== 0 ? (
              <Text style={{ fontSize: 6, textAlign: 'right', color: '#475569', fontFamily: 'Helvetica' }}>ZiG {fmt(zigAmt)}</Text>
            ) : null}
          </View>
          <Text style={s.rowYtd}>{usd(getYtd(item) ?? usdAmt)}</Text>
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

  const earnings   = lineItems.filter(i => (i.allowance ?? 0) > 0);
  const deductions = lineItems.filter(i => (i.deduction  ?? 0) > 0);
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
            getYtd={e => e.ytd}
            isDual={isDual}
          />
          <TableSection
            title="DEDUCTIONS" titleColor="#fb7185"
            rows={deductions}
            getAmt={d => d.deduction}
            getAmtZIG={d => d.deductionZIG}
            getYtd={d => d.ytd}
            isDual={isDual}
          />
        </View>

        {/* ── Section 5: Employer Contributions ──────────────────────── */}
        {employers.length > 0 && (
          <View style={s.empSection}>
            <View style={s.empHeader}>
              <Text style={s.empTitle}>STATUTORY EMPLOYER CONTRIBUTIONS</Text>
              <View style={s.empSubHdrs}>
                <Text style={[s.subHdrDesc, { flex: 1 }]}>DESCRIPTION</Text>
                <Text style={s.subHdrAmt}>AMOUNT (USD)</Text>
                <Text style={s.subHdrYtd}>YTD (USD)</Text>
              </View>
            </View>
            {employers.map((c, idx) => (
              <View key={idx} style={[s.empRow, idx % 2 === 0 ? { backgroundColor: '#f0f4ff' } : {}]}>
                <Text style={s.empRowDesc}>{c.name}</Text>
                <Text style={s.empRowAmt}>{usd(c.employer)}</Text>
                {c.ytd != null && <Text style={s.empRowYtd}>{usd(c.ytd)}</Text>}
              </View>
            ))}
          </View>
        )}

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
