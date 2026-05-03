import { render, screen } from '@testing-library/react';
import { SectionCard } from '../section-card';

describe('SectionCard', () => {
  it('renders title in uppercase style', () => {
    render(<SectionCard title="Personal Details"><p>content</p></SectionCard>);
    expect(screen.getByText('Personal Details')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<SectionCard title="Test"><p>inner content</p></SectionCard>);
    expect(screen.getByText('inner content')).toBeInTheDocument();
  });
});
