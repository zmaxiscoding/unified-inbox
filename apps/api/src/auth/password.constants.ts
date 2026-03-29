export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HASH_ROUNDS = process.env.NODE_ENV === "test" ? 4 : 12;
