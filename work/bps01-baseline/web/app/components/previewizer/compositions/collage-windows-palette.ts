export type CollageWindowsPalette = {
  gradientLight: string;
  gradientMid: string;
  gradientDark: string;
  logoTop: string;
  logoBottom: string;
  preview: string;
};

export const COLLAGE_WINDOWS_DEFAULT_HUE = 224;

export function buildCollageWindowsPalette(hue: number): CollageWindowsPalette {
  const h = ((Math.round(hue) % 360) + 360) % 360;

  return {
    gradientLight: `hsl(${h}, 64%, 33%)`,
    gradientMid: `hsl(${h}, 64%, 29%)`,
    gradientDark: `hsl(${h}, 66%, 17%)`,
    logoTop: `hsl(${h}, 64%, 33%)`,
    logoBottom: `hsl(${h}, 67%, 27%)`,
    preview: `hsl(${h}, 64%, 33%)`
  };
}
