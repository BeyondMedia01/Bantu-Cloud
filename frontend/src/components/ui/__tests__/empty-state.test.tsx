import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../empty-state';
import { Users } from 'lucide-react';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState variant="no-data" title="No employees" description="Add one to get started." />);
    expect(screen.getByText('No employees')).toBeInTheDocument();
    expect(screen.getByText('Add one to get started.')).toBeInTheDocument();
  });

  it('renders action button when action is provided', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        variant="no-data"
        title="No data"
        description="desc"
        action={{ label: 'Add Employee', onClick }}
      />
    );
    const btn = screen.getByRole('button', { name: 'Add Employee' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render action button when action is omitted', () => {
    render(<EmptyState variant="no-data" title="No data" description="desc" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses default icon for no-data variant', () => {
    const { container } = render(<EmptyState variant="no-data" title="No data" description="desc" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('uses provided icon over default', () => {
    render(<EmptyState variant="no-data" icon={Users} title="No users" description="desc" />);
    expect(document.querySelector('svg')).toBeInTheDocument();
  });
});
