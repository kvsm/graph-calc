/**
 * A deliberately minimal, locked-down mathjs instance.
 *
 * We only use mathjs for *parsing*. Evaluation is done by our own compiler
 * (see compile.ts) over an allow-listed AST, so no mathjs function is ever
 * invoked on user input. As defence in depth we still follow the mathjs
 * security guidance (https://mathjs.org/docs/expressions/security.html) and
 * replace the dangerous functions on the instance with stubs that throw.
 */
import { create, parseDependencies, type MathNode } from 'mathjs'

const math = create({ parseDependencies })

// Capture the parser before the namespace is locked down.
const rawParse = math.parse

function disabled(name: string) {
  return () => {
    throw new Error(`Function ${name} is disabled`)
  }
}

const DISABLED_FUNCTIONS = [
  'import',
  'createUnit',
  'reviver',
  'evaluate',
  'parse',
  'compile',
  'simplify',
  'simplifyConstant',
  'simplifyCore',
  'derivative',
  'resolve',
  'rationalize',
  'chain',
  'config',
] as const

math.import(
  Object.fromEntries(DISABLED_FUNCTIONS.map((name) => [name, disabled(name)])),
  { override: true },
)

/** Names disabled on the internal mathjs instance (exported for tests). */
export const disabledMathjsFunctions: readonly string[] = DISABLED_FUNCTIONS

/** The locked-down mathjs namespace (exported for tests only). */
export const lockedMath = math

/** Parse an expression string into a mathjs AST. Throws mathjs errors. */
export function parseToAst(source: string): MathNode {
  return rawParse(source)
}
