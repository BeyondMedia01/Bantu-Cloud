import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight, Users, DollarSign, FileText, Shield } from 'lucide-react';

const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background font-inter text-navy">
      {/* Nav */}
      <nav className="sticky top-0 bg-primary/80 backdrop-blur border-b border-border z-50 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent-green rounded-xl flex items-center justify-center text-white font-bold text-lg">B</div>
          <span className="text-lg font-bold">Bantu Payroll</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/login')} className="text-sm font-bold text-slate-500 hover:text-navy transition-colors">Sign In</button>
          <button onClick={() => navigate('/register')} className="bg-brand text-navy px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center py-24 px-6 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-full text-xs font-bold text-accent-green uppercase tracking-wider mb-8">
          <Shield size={12} /> ZIMRA & NSSA Compliant
        </div>
        <h1 className="text-5xl lg:text-6xl font-bold leading-tight mb-6">
          Payroll Made Simple<br />for <span className="text-accent-green">Zimbabwe</span>
        </h1>
        <p className="text-xl text-slate-500 font-medium max-w-2xl mx-auto mb-10">
          Automated PAYE calculation, NSSA contributions, leave management, and loans — built for Zimbabwean businesses.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => navigate('/register')}
            className="bg-brand text-navy px-8 py-4 rounded-full font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-2 text-lg"
          >
            Start Free Trial <ArrowRight size={20} />
          </button>
          <button onClick={() => navigate('/login')} className="px-8 py-4 rounded-full font-bold border border-border hover:bg-slate-50 transition-colors text-lg">
            Sign In
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="bg-primary border-y border-border py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Everything You Need</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <DollarSign size={24} />, title: 'Payroll Engine', desc: 'Automated PAYE, AIDS Levy, and NSSA calculations per ZIMRA guidelines.' },
              { icon: <Users size={24} />, title: 'HR Management', desc: 'Full employee records, org hierarchy, branches, and departments.' },
              { icon: <FileText size={24} />, title: 'Payslip & P16', desc: 'PDF payslips and ZIMRA P16 tax certificates generated automatically.' },
              { icon: <Shield size={24} />, title: 'Multi-Tenant', desc: 'Manage multiple companies and clients from a single platform.' },
            ].map((f) => (
              <div key={f.title} className="p-6 rounded-2xl border border-border bg-background">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-accent-green mb-4">{f.icon}</div>
                <h3 className="font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-6 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">Why Bantu?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            'Zimbabwean PAYE (FDS) compliance built in',
            'USD and ZiG currency support',
            'Leave management with approval workflows',
            'Employee loan tracking and repayment schedules',
            'Role-based access: Admin, Client Admin, Employee',
            'Employee self-service portal',
            'CSV & PDF export for all reports',
            'Stripe subscription billing',
          ].map((b) => (
            <div key={b} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-primary">
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
              <span className="text-sm font-medium">{b}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand text-navy py-20 px-6 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
        <p className="text-slate-300 font-medium mb-8 max-w-md mx-auto">Join businesses across Zimbabwe using Bantu Payroll to stay compliant and save time.</p>
        <button
          onClick={() => navigate('/register')}
          className="bg-white text-navy px-8 py-4 rounded-full font-bold shadow-lg hover:opacity-90 transition-opacity inline-flex items-center gap-2"
        >
          Get Started Free <ArrowRight size={18} />
        </button>
      </section>

      <footer className="bg-primary border-t border-border py-8 px-6 text-center text-sm text-slate-400 font-medium">
        © {new Date().getFullYear()} Bantu Payroll. Built for Zimbabwe.
      </footer>
    </div>
  );
};

export default Landing;
