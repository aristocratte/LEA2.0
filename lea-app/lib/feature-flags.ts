function isEnabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export const ENABLE_EXPERIMENTAL_RUNTIME_UI = isEnabled(
  process.env.NEXT_PUBLIC_LEA_EXPERIMENTAL_UI,
) || isEnabled(
  process.env.NEXT_PUBLIC_LEA_EXPERIMENTAL_RUNTIME_UI,
);

export const ENABLE_ADVANCED_SCAN_CONTROLS = isEnabled(
  process.env.NEXT_PUBLIC_LEA_EXPERIMENTAL_UI,
) || isEnabled(
  process.env.NEXT_PUBLIC_LEA_ADVANCED_SCAN_CONTROLS,
);

export const ENABLE_EXPERIMENTAL_UI = isEnabled(
  process.env.NEXT_PUBLIC_LEA_EXPERIMENTAL_UI,
);
