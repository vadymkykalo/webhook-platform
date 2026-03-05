import { useEffect, useRef, useCallback } from 'react';
import { EditorView, keymap, placeholder as cmPlaceholder, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { lintGutter } from '@codemirror/lint';
import { closeBrackets } from '@codemirror/autocomplete';

interface JsonEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  className?: string;
  darkMode?: boolean;
}

export default function JsonEditor({
  value,
  onChange,
  placeholder = '',
  readOnly = false,
  minHeight = '200px',
  maxHeight = '400px',
  className = '',
  darkMode,
}: JsonEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Detect dark mode from DOM if not explicitly set
  const isDark = darkMode ?? (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));

  const createState = useCallback((doc: string) => {
    const extensions = [
      json(),
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      bracketMatching(),
      closeBrackets(),
      foldGutter(),
      lintGutter(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([...defaultKeymap, indentWithTab]),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          minHeight,
          maxHeight,
          fontSize: '12px',
          border: '1px solid hsl(var(--border))',
          borderRadius: 'calc(var(--radius) - 2px)',
          backgroundColor: 'hsl(var(--background))',
        },
        '.cm-scroller': {
          overflow: 'auto',
          maxHeight,
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        },
        '.cm-content': {
          padding: '8px 0',
          caretColor: 'hsl(var(--foreground))',
        },
        '.cm-gutters': {
          backgroundColor: 'hsl(var(--muted))',
          color: 'hsl(var(--muted-foreground))',
          border: 'none',
          borderRight: '1px solid hsl(var(--border))',
        },
        '.cm-activeLine': {
          backgroundColor: 'hsl(var(--accent) / 0.3)',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'hsl(var(--accent) / 0.3)',
        },
        '&.cm-focused': {
          outline: '2px solid hsl(var(--ring))',
          outlineOffset: '-1px',
        },
        '.cm-placeholder': {
          color: 'hsl(var(--muted-foreground))',
          fontStyle: 'italic',
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      }),
    ];

    if (placeholder) {
      extensions.push(cmPlaceholder(placeholder));
    }

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    if (isDark) {
      extensions.push(oneDark);
    }

    return EditorState.create({ doc, extensions });
  }, [minHeight, maxHeight, placeholder, readOnly, isDark]);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: createState(value),
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  // Recreate state when theme/readOnly changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    view.setState(createState(currentDoc));
  }, [isDark, readOnly, createState]);

  return (
    <div ref={containerRef} className={`json-editor ${className}`} />
  );
}
