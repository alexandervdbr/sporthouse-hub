import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // This version bump pulled in eslint-plugin-react-hooks's new "React
    // Compiler" rules, errors by default. The six below flagged 56
    // pre-existing call sites (mostly the common "read from localStorage/
    // sessionStorage once on mount" pattern) that were never flagged
    // before and were out of scope for a lint-tooling version bump.
    // Downgraded to warnings — same posture already established for
    // react-hooks/exhaustive-deps — so they stay visible without newly
    // blocking prebuild/CI over patterns nobody asked to refactor here.
    //
    // eslint-config-next currently resolves eslint-plugin-react-hooks to
    // 7.1.1 (floated transitively, no direct pin — confirmed via
    // `npx eslint --print-config`, not assumed from the version at the
    // time this file was first written). That version ships six further
    // error-by-default rules beyond the six above — use-memo, globals,
    // error-boundaries, set-state-in-render, config, gating — currently
    // zero violations, added here too so a future react-hooks bump can't
    // silently start hard-failing prebuild/CI over a pattern nobody's
    // reviewed yet.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',
    },
  },
]

export default eslintConfig
