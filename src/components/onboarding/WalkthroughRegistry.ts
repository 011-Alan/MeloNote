import { View } from 'react-native';

const registry = new Map<string, any>();

export const WalkthroughRegistry = {
  register: (id: string, ref: any) => {
    if (ref) registry.set(id, ref);
    else registry.delete(id);
  },
  get: (id: string) => registry.get(id),
};
