import { detectCardType, type CardType } from '@/lib/validators/zw';

const STYLES: Record<CardType, string> = {
  Visa:         'bg-blue-50 text-blue-700 border-blue-200',
  Mastercard:   'bg-orange-50 text-orange-700 border-orange-200',
  Verve:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Bank Account': 'bg-muted text-foreground/70 border-border',
  Unknown:      'bg-red-50 text-red-600 border-red-200',
};

const ICONS: Record<CardType, string> = {
  Visa: '💳',
  Mastercard: '💳',
  Verve: '💳',
  'Bank Account': '🏦',
  Unknown: '✕',
};

interface Props {
  accountNumber: string;
}

export default function CardTypeBadge({ accountNumber }: Props) {
  const cleaned = accountNumber.replace(/[\s-]/g, '');
  if (!cleaned) return null;
  const type = detectCardType(cleaned);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${STYLES[type]}`}>
      <span>{ICONS[type]}</span>
      {type}
    </span>
  );
}
