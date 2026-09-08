import { useRef, type ReactNode } from 'react';

interface Props {
  accept: string;
  multiple?: boolean;
  onPick: (files: FileList | null) => void;
  children: ReactNode;
  className?: string;
}

/**
 * A button that opens the file dialog. The hidden input, the click through to it
 * and the reset afterwards are the browser's terms, not the editor's — and
 * without the reset, picking the same file twice in a row fires no change event.
 */
export function FilePicker({ accept, multiple, onPick, children, className }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple ?? false}
        hidden
        onChange={e => { onPick(e.target.files); e.target.value = ''; }}
      />
    </>
  );
}
