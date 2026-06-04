// Applies Poppins app-wide by patching the base fontFamily on every <Text>
// and <TextInput>, mapping the numeric fontWeight in each style to the matching
// Poppins weight file (so bold text stays bold). Existing styles still win.
import React from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet } from 'react-native';
import {
  Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';

export const POPPINS_FONTS = {
  Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold,
};

const WEIGHT = {
  100: 'Poppins_400Regular', 200: 'Poppins_400Regular', 300: 'Poppins_400Regular',
  400: 'Poppins_400Regular', normal: 'Poppins_400Regular',
  500: 'Poppins_500Medium', 600: 'Poppins_600SemiBold',
  700: 'Poppins_700Bold', bold: 'Poppins_700Bold',
  800: 'Poppins_800ExtraBold', 900: 'Poppins_800ExtraBold',
};

let patched = false;
export function applyPoppins() {
  if (patched) return;
  patched = true;
  [RNText, RNTextInput].forEach((Comp) => {
    const orig = Comp.render;
    if (!orig) return;
    Comp.render = function render(...args) {
      const el = orig.apply(this, args);
      const flat = StyleSheet.flatten(el.props.style) || {};
      const fam = WEIGHT[flat.fontWeight] || WEIGHT[String(flat.fontWeight)] || 'Poppins_400Regular';
      return React.cloneElement(el, { style: [{ fontFamily: fam }, el.props.style] });
    };
  });
}
