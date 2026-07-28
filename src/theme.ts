export const colors = {
  background: '#F7F1E8',
  paper: '#FFFCF7',
  paperStrong: '#FFFFFF',
  ink: '#25231F',
  inkSoft: '#504B44',
  muted: '#7A746A',
  line: '#DED4C7',
  lineStrong: '#C8BAA8',
  primary: '#D97757',
  primaryDark: '#A84F35',
  primarySoft: '#F1D4C7',
  sage: '#84957A',
  sageSoft: '#E3E9DE',
  gold: '#D4A64A',
  danger: '#B94E43',
  camera: '#11110F',
  cameraSoft: '#24221E',
  white: '#FFFFFF',
  overlay: 'rgba(17, 17, 15, 0.66)',
} as const;

export const radii = {
  small: 10,
  medium: 16,
  large: 24,
  pill: 999,
} as const;

export const shadows = {
  floating: {
    shadowColor: '#211A14',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;
