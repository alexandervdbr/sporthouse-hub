import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // This version bump pulled in eslint-plugin-react-hooks v6, whose new
    // "React Compiler" rules are errors by default and flagged 56
    // pre-existing call sites (mostly the common "read from localStorage/
    // sessionStorage once on mount" pattern) that were never flagged
    // before and were out of scope for a lint-tooling version bump.
    // Downgraded to warnings — same posture already established for
    // react-hooks/exhaustive-deps — so they stay visible without newly
    // blocking prebuild/CI over patterns nobody asked to refactor here.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
]

export default eslintConfig
