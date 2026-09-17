// App entry. Polyfills load before anything else: @noble/hashes (inside viem) reads
// globalThis.crypto once, when it is first imported, and expo-router evaluates route files
// before app/_layout.tsx runs. Imported from the layout, the polyfill arrived too late and
// Mezo wallet creation failed with "crypto.getRandomValues must be defined".
import './lib/polyfills';
import 'expo-router/entry';
