import { fireEvent, render, screen } from '@testing-library/react';
import { Dropdown } from './dropdown';

const makeBasicSections = () => [{
  items: [
    { label: 'CBZ', onClick: vi.fn() },
    { label: 'Stanbic', onClick: vi.fn() },
  ],
}];

describe('Dropdown', () => {
  it('does not show panel on initial render', () => {
    render(<Dropdown trigger={<button>Open</button>} sections={makeBasicSections()} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows panel when trigger is clicked', () => {
    render(<Dropdown trigger={<button>Open</button>} sections={makeBasicSections()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('CBZ')).toBeInTheDocument();
    expect(screen.getByText('Stanbic')).toBeInTheDocument();
  });

  it('closes when an item is clicked and calls onClick', () => {
    const onCbz = vi.fn();
    render(
      <Dropdown
        trigger={<button>Open</button>}
        sections={[{ items: [{ label: 'CBZ', onClick: onCbz }] }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByText('CBZ'));
    expect(onCbz).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    render(<Dropdown trigger={<button>Open</button>} sections={makeBasicSections()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on outside click', () => {
    render(
      <div>
        <Dropdown trigger={<button>Open</button>} sections={makeBasicSections()} />
        <button>Outside</button>
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders section heading when provided', () => {
    render(
      <Dropdown
        trigger={<button>Open</button>}
        sections={[{ heading: 'Choose Bank', items: [{ label: 'CBZ', onClick: vi.fn() }] }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Choose Bank')).toBeInTheDocument();
  });

  it('renders emptyMessage when items array is empty', () => {
    render(
      <Dropdown
        trigger={<button>Open</button>}
        sections={[{ items: [], emptyMessage: 'Nothing here' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('does not open panel when all sections are empty and no emptyMessage', () => {
    render(
      <Dropdown
        trigger={<button>Open</button>}
        sections={[{ items: [] }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not open when disabled', () => {
    render(<Dropdown trigger={<button>Open</button>} sections={makeBasicSections()} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('passes isOpen to trigger function', () => {
    render(
      <Dropdown
        trigger={(isOpen) => <button>{isOpen ? 'Close' : 'Open'}</button>}
        sections={makeBasicSections()}
      />
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('renders custom renderItem instead of label', () => {
    render(
      <Dropdown
        trigger={<button>Open</button>}
        sections={[{
          items: [{
            renderItem: () => <span data-testid="custom">Custom</span>,
            onClick: vi.fn(),
          }],
        }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('custom')).toBeInTheDocument();
  });

  it('aligns panel to the right when align="right"', () => {
    render(<Dropdown trigger={<button>Open</button>} sections={makeBasicSections()} align="right" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const panel = screen.getByRole('menu');
    expect(panel.className).toMatch(/right-0/);
  });

  it('aligns panel to the left by default', () => {
    render(<Dropdown trigger={<button>Open</button>} sections={makeBasicSections()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const panel = screen.getByRole('menu');
    expect(panel.className).toMatch(/left-0/);
  });

  it('stops propagation on wrapper click when stopPropagation is set', () => {
    const rowClick = vi.fn();
    render(
      <div onClick={rowClick}>
        <Dropdown stopPropagation trigger={<button>Open</button>} sections={makeBasicSections()} />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('stops propagation on item click when stopPropagation is set', () => {
    const rowClick = vi.fn();
    render(
      <div onClick={rowClick}>
        <Dropdown
          stopPropagation
          trigger={<button>Open</button>}
          sections={[{ items: [{ label: 'CBZ', onClick: vi.fn() }] }]}
        />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByText('CBZ'));
    expect(rowClick).not.toHaveBeenCalled();
  });
});
