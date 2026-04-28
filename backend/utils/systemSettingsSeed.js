const prisma = require('../lib/prisma');

/**
 * Ensures that critical system settings exist in the database with default values.
 * This handles cases where a developer adds a new setting dependency but the 
 * setting hasn't been manually created in the database yet.
 */
async function autoSeedSystemSettings() {
  console.log('[Seed] Checking for missing system settings...');
  
  const defaults = [
    // ── Working Days ────────────────────────────────────────────────────────────
    {
      settingName: 'WORKING_DAYS_PER_MONTH',
      settingValue: '22',
      dataType: 'NUMBER',
      description: 'Legacy monthly working days fallback. See WORKING_DAYS_PER_PERIOD.',
      isActive: true
    },
    {
      settingName: 'WORKING_DAYS_PER_PERIOD',
      settingValue: '22',
      dataType: 'NUMBER',
      description: 'Default number of working days in a payroll period. Used for pro-rating, short-time, and daily rate calculations when not specified on the employee profile.',
      isActive: true
    },
    {
      settingName: 'DAYS_PER_MONTH',
      settingValue: '30',
      dataType: 'NUMBER',
      description: 'Calendar days per month used for leave encashment and termination calculations.',
      isActive: true
    },

    // ── NSSA ────────────────────────────────────────────────────────────────────
    {
      settingName: 'NSSA_EMPLOYEE_RATE',
      settingValue: '4.5',
      dataType: 'NUMBER',
      description: 'Employee NSSA contribution rate for USD payrolls (percentage). Current ZIMRA rate: 4.5%.',
      isActive: true
    },
    {
      settingName: 'NSSA_EMPLOYER_RATE',
      settingValue: '4.5',
      dataType: 'NUMBER',
      description: 'Employer NSSA contribution rate for USD payrolls (percentage). Current ZIMRA rate: 4.5%.',
      isActive: true
    },
    {
      settingName: 'NSSA_EMPLOYEE_RATE_ZIG',
      settingValue: '4.5',
      dataType: 'NUMBER',
      description: 'Employee NSSA contribution rate for ZiG payrolls (percentage). Independent from USD rate.',
      isActive: true
    },
    {
      settingName: 'NSSA_EMPLOYER_RATE_ZIG',
      settingValue: '4.5',
      dataType: 'NUMBER',
      description: 'Employer NSSA contribution rate for ZiG payrolls (percentage). Independent from USD rate.',
      isActive: true
    },
    {
      settingName: 'NSSA_CEILING_USD',
      settingValue: '700',
      dataType: 'NUMBER',
      description: 'NSSA insurable earnings ceiling in USD per month.',
      isActive: true
    },
    {
      settingName: 'NSSA_CEILING_ZIG',
      settingValue: '18000',
      dataType: 'NUMBER',
      description: 'NSSA insurable earnings ceiling in ZiG per month. Independent from USD ceiling.',
      isActive: true
    },

    // ── AIDS Levy ────────────────────────────────────────────────────────────────
    {
      settingName: 'AIDS_LEVY_RATE',
      settingValue: '3',
      dataType: 'NUMBER',
      description: 'AIDS Levy rate applied on top of PAYE (percentage). Current ZIMRA rate: 3%.',
      isActive: true
    },

    // ── Medical Aid Credit ───────────────────────────────────────────────────────
    {
      settingName: 'MEDICAL_AID_CREDIT_RATE',
      settingValue: '50',
      dataType: 'NUMBER',
      description: 'Percentage of medical aid contribution that qualifies as a PAYE tax credit (Belina: 50%).',
      isActive: true
    },

    // ── Bonus Tax-Free Exemption ─────────────────────────────────────────────────
    {
      settingName: 'BONUS_EXEMPTION_USD',
      settingValue: '700',
      dataType: 'NUMBER',
      description: 'Annual tax-free bonus exemption in USD per ZIMRA (Belina: $700.00).',
      isActive: true
    },
    {
      settingName: 'BONUS_EXEMPTION_ZIG',
      settingValue: '21000',
      dataType: 'NUMBER',
      description: 'Annual tax-free bonus exemption in ZiG per ZIMRA.',
      isActive: true
    },

    // ── Pension Cap (pre-tax deductible limit) ───────────────────────────────────
    {
      settingName: 'PENSION_CAP_USD',
      settingValue: '5400',
      dataType: 'NUMBER',
      description: 'Annual maximum pension contribution deductible before PAYE in USD (Belina: $5,400.00). Applies per tax year.',
      isActive: true
    },
    {
      settingName: 'PENSION_CAP_ZIG',
      settingValue: '0',
      dataType: 'NUMBER',
      description: 'Annual maximum pension contribution deductible before PAYE in ZiG. Set to 0 to disable cap.',
      isActive: true
    },

    // ── Severance Exemption ──────────────────────────────────────────────────────
    {
      settingName: 'SEVERANCE_EXEMPTION_USD',
      settingValue: '10000',
      dataType: 'NUMBER',
      description: 'Tax-free severance pay exemption in USD per ZIMRA.',
      isActive: true
    },
    {
      settingName: 'SEVERANCE_EXEMPTION_ZIG',
      settingValue: '0',
      dataType: 'NUMBER',
      description: 'Tax-free severance pay exemption in ZiG per ZIMRA. Set to 0 to disable.',
      isActive: true
    },

    // ── Elderly Tax Credit ───────────────────────────────────────────────────────
    {
      settingName: 'ELDERLY_TAX_CREDIT_USD',
      settingValue: '75',
      dataType: 'NUMBER',
      description: 'Monthly PAYE tax credit for employees aged 65+ in USD (Belina: ELDERLY category).',
      isActive: true
    },
    {
      settingName: 'ELDERLY_TAX_CREDIT_ZIG',
      settingValue: '900',
      dataType: 'NUMBER',
      description: 'Monthly PAYE tax credit for employees aged 65+ in ZiG (Belina: ELDERLY category).',
      isActive: true
    },

    // ── Statutory Levy Rates ─────────────────────────────────────────────────────
    {
      settingName: 'ZIMDEF_RATE',
      settingValue: '1',
      dataType: 'NUMBER',
      description: 'ZIMDEF (Zimbabwe Manpower Development Fund) levy rate (percentage of gross payroll).',
      isActive: true
    },
    {
      settingName: 'WCIF_RATE',
      settingValue: '0',
      dataType: 'NUMBER',
      description: 'Workers Compensation Insurance Fund rate (percentage). Varies by industry — override at company level.',
      isActive: true
    },
    {
      settingName: 'SDF_RATE',
      settingValue: '0',
      dataType: 'NUMBER',
      description: 'Skills Development Fund rate (percentage). Override at company level as required.',
      isActive: true
    },

    // ── Work Period Defaults ─────────────────────────────────────────────────────
    {
      settingName: 'HOURS_PER_DAY',
      settingValue: '8',
      dataType: 'NUMBER',
      description: 'Standard working hours per day. Used as fallback when employee has no hoursPerPeriod set.',
      isActive: true
    },

    // ── Loan Prescribed Rates ────────────────────────────────────────────────────
    {
      settingName: 'LOAN_PRESCRIBED_RATE_USD',
      settingValue: '15',
      dataType: 'NUMBER',
      description: 'ZIMRA prescribed interest rate for USD loans (for Deemed Interest calculation).',
      isActive: true
    },
    {
      settingName: 'LOAN_PRESCRIBED_RATE_ZIG',
      settingValue: '150',
      dataType: 'NUMBER',
      description: 'ZIMRA prescribed interest rate for ZiG loans (for Deemed Interest calculation).',
      isActive: true
    },

    // ── Vehicle Deemed Benefit (by engine cc tier) ───────────────────────────────
    {
      settingName: 'VEHICLE_BENEFIT_CC_1500_USD',
      settingValue: '375',
      dataType: 'NUMBER',
      description: 'Monthly USD deemed vehicle benefit for engine ≤1500cc (ZIMRA Finance Act 2026: $4,500/yr ÷ 12).',
      isActive: true
    },
    {
      settingName: 'VEHICLE_BENEFIT_CC_2000_USD',
      settingValue: '600',
      dataType: 'NUMBER',
      description: 'Monthly USD deemed vehicle benefit for engine 1501–2000cc (ZIMRA Finance Act 2026: $7,200/yr ÷ 12).',
      isActive: true
    },
    {
      settingName: 'VEHICLE_BENEFIT_ABOVE_2000_USD',
      settingValue: '800',
      dataType: 'NUMBER',
      description: 'Monthly USD deemed vehicle benefit for engine >2000cc (ZIMRA Finance Act 2026: $9,600/yr ÷ 12).',
      isActive: true
    },
    {
      settingName: 'VEHICLE_BENEFIT_CC_1500_ZIG',
      settingValue: '8970',
      dataType: 'NUMBER',
      description: 'Monthly ZiG deemed vehicle benefit for engine ≤1500cc. Update when RBZ rate changes.',
      isActive: true
    },
    {
      settingName: 'VEHICLE_BENEFIT_CC_2000_ZIG',
      settingValue: '14352',
      dataType: 'NUMBER',
      description: 'Monthly ZiG deemed vehicle benefit for engine 1501–2000cc. Update when RBZ rate changes.',
      isActive: true
    },
    {
      settingName: 'VEHICLE_BENEFIT_ABOVE_2000_ZIG',
      settingValue: '19136',
      dataType: 'NUMBER',
      description: 'Monthly ZiG deemed vehicle benefit for engine >2000cc. Update when RBZ rate changes.',
      isActive: true
    }
  ];

  for (const item of defaults) {
    const existing = await prisma.systemSetting.findFirst({
      where: { settingName: item.settingName }
    });

    if (!existing) {
      console.log(`[Seed] Creating missing setting: ${item.settingName} = ${item.settingValue}`);
      await prisma.systemSetting.create({
        data: {
          ...item,
          effectiveFrom: new Date('2024-01-01'),
          lastUpdatedBy: 'System Auto-Seed'
        }
      });
    }
  }

}

module.exports = { autoSeedSystemSettings };
