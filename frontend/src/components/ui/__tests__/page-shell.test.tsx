import { render, screen, fireEvent } from '@testing-library/react';
import { PageShell } from '../page-shell';

describe('PageShell', () => {
  it('renders title and subtitle', () => {
    render(<PageShell title="Employees" subtitle="Manage your workforce"><div /></PageShell>);
    expect(screen.getByText('Employees')).toBeInTheDocument();
    expect(screen.getByText('Manage your workforce')).toBeInTheDocument();
  });

  it('renders back button when onBack is provided', () => {
    const onBack = vi.fn();
    render(<PageShell title="Test" onBack={onBack}><div /></PageShell>);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('does not render back button when onBack is omitted', () => {
    render(<PageShell title="Test"><div /></PageShell>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders actions slot', () => {
    render(
      <PageShell title="Test" actions={<button>Add</button>}><div /></PageShell>
    );
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<PageShell title="Test"><p>Content</p></PageShell>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
