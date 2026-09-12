import { customAlphabet } from 'nanoid';

// Class join slugs stay short and typeable: no 0/O, 1/l ambiguity.
const slugAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const codeAlphabet = '0123456789';

export const newJoinSlug = customAlphabet(slugAlphabet, 6);
export const newSessionCode = (length = 6) => customAlphabet(codeAlphabet, length)();
