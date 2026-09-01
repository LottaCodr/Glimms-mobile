import React from 'react'
import {
  ColorValue,
  Image,
  ImageStyle,
  StyleProp,
} from 'react-native'
import { Colors } from '@/theme'

export type BrandLogoVariant = 'mark' | 'lockup' | 'compact'

type Props = {
  /**
   * mark: monogram only
   * lockup: monogram with the wordmark underneath
   * compact: wordmark integrated into the monogram
   */
  variant?: BrandLogoVariant
  width: number
  color?: ColorValue
  style?: StyleProp<ImageStyle>
  accessibilityLabel?: string
}

const ARTWORK = {
  mark: {
    source: require('../../assets/images/brand/glimms-mark-mask.png'),
    aspectRatio: 690 / 969,
  },
  lockup: {
    source: require('../../assets/images/brand/glimms-lockup-mask.png'),
    aspectRatio: 690 / 1231,
  },
  compact: {
    source: require('../../assets/images/brand/glimms-compact-mask.png'),
    aspectRatio: 1162 / 1632,
  },
} as const

/**
 * The supplied GLIMMS artwork, exposed as a tintable mask so every in-app use
 * stays tied to the existing brand-gold token rather than a hard-coded asset
 * colour.
 */
export function BrandLogo({
  variant = 'mark',
  width,
  color = Colors.gold,
  style,
  accessibilityLabel = 'GLIMMS',
}: Props) {
  const artwork = ARTWORK[variant]

  return (
    <Image
      source={artwork.source}
      style={[
        {
          width,
          height: width / artwork.aspectRatio,
        },
        style,
      ]}
      resizeMode="contain"
      tintColor={color}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  )
}
