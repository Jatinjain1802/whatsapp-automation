/*
  selectStyles.js — Reusable dark theme styles for react-select
  -------------------------------------------------------------
  WHY CUSTOM STYLES?
  By default, `react-select` uses a light theme (white background,
  dark text, blue focus ring). We override the inner elements using
  React-Select's `styles` configuration object so the dropdown
  seamlessly matches our application's CSS design tokens.

  KEY PARTS:
  - control: The outer input box container
  - menu: The popup dropdown container
  - option: Each individual selectable item in the menu
  - singleValue: The label displayed when an option is selected
  - placeholder: The placeholder text shown when no value is selected
  - input: The search/typeahead text input element
*/

export const selectStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: state.isFocused ? 'var(--color-primary)' : 'var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    minHeight: '42px',
    boxShadow: state.isFocused ? '0 0 0 1px var(--color-primary)' : 'none',
    '&:hover': {
      borderColor: state.isFocused ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.15)',
    },
    cursor: 'pointer',
    fontSize: '14px',
    marginBottom: '12px',
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: 'var(--color-surface-solid, #1a1d29)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-card)',
    zIndex: 30,
    overflow: 'hidden',
  }),
  menuList: (base) => ({
    ...base,
    padding: '4px',
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? 'var(--color-primary)'
      : state.isFocused
      ? 'rgba(37, 211, 102, 0.12)'
      : 'transparent',
    color: state.isSelected ? '#0f1117' : 'var(--color-text)',
    cursor: 'pointer',
    fontSize: '14px',
    borderRadius: '4px',
    fontWeight: state.isSelected ? 600 : 400,
    '&:active': {
      backgroundColor: 'rgba(37, 211, 102, 0.25)',
    },
  }),
  singleValue: (base) => ({
    ...base,
    color: 'var(--color-text)',
    fontSize: '14px',
  }),
  input: (base) => ({
    ...base,
    color: 'var(--color-text)',
  }),
  placeholder: (base) => ({
    ...base,
    color: 'var(--color-text-muted)',
    fontSize: '14px',
  }),
};

