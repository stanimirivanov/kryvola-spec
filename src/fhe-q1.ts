import { Schema } from "effect";

/** FheQ1Operator names elementwise unsigned ciphertext/ciphertext operations. */
export const FheQ1Operator = Schema.Literals(["ADD", "MUL"]);
/** FheQ1Arithmetic computes exactly in Z/(2^w), without checked-overflow semantics. */
export const FheQ1Arithmetic = Schema.Literal("EXACT_MODULAR");
/** FheQ1Precision fixes w from dtype; inputs must already be integers in [0, 2^w). */
export const FheQ1Precision = Schema.Struct({
  dtype: Schema.Literals(["uint8", "uint16", "uint32", "uint64"]),
  fractional_bits: Schema.Literal("0"),
  overflow: Schema.Literal("WRAP"),
});
