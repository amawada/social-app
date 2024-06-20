import React from 'react'
import {View} from 'react-native'
import ViewShot from 'react-native-view-shot'
import * as FS from 'expo-file-system'
import {requestMediaLibraryPermissionsAsync} from 'expo-image-picker'
import * as Sharing from 'expo-sharing'
import {AppBskyGraphDefs, AppBskyGraphStarterpack, AtUri} from '@atproto/api'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {nanoid} from 'nanoid/non-secure'

import {logger} from '#/logger'
import {saveImageToMediaLibrary} from 'lib/media/manip'
import {makeStarterPackLink} from 'lib/routes/links'
import {logEvent} from 'lib/statsig/statsig'
import {isNative, isWeb} from 'platform/detection'
import {useShortenLink} from 'state/queries/shorten-link'
import * as Toast from '#/view/com/util/Toast'
import {atoms as a} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {DialogControlProps} from '#/components/Dialog'
import {Loader} from '#/components/Loader'
import {QrCode} from '#/components/StarterPack/QrCode'

export function QrCodeDialog({
  control,
  starterPack,
  isOpen,
  setIsOpen,
}: {
  control: DialogControlProps
  starterPack: AppBskyGraphDefs.StarterPackView
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const {_} = useLingui()
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [link, setLink] = React.useState<string>()
  const shortenLink = useShortenLink()

  const ref = React.useRef<ViewShot>(null)

  React.useEffect(() => {
    if (!isOpen || link) return
    ;(async () => {
      const rkey = new AtUri(starterPack.uri).rkey
      const res = await shortenLink(
        makeStarterPackLink(starterPack.creator.did, rkey),
      )
      setLink(res.url)
    })()
  }, [isOpen, link, shortenLink, starterPack.creator.did, starterPack.uri])

  const getCanvas = (base64: string): Promise<HTMLCanvasElement> => {
    return new Promise(resolve => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height

        const ctx = canvas.getContext('2d')
        ctx?.drawImage(image, 0, 0)
        resolve(canvas)
      }
      image.src = base64
    })
  }

  const onSavePress = async () => {
    ref.current?.capture?.().then(async (uri: string) => {
      if (isNative) {
        const res = await requestMediaLibraryPermissionsAsync()

        if (!res) {
          Toast.show(
            _(
              msg`You must grant access to your photo library to save a QR code`,
            ),
          )
          return
        }

        const filename = `${FS.documentDirectory}/${nanoid(12)}.png`

        // Incase of a FS failure, don't crash the app
        try {
          await FS.copyAsync({from: uri, to: filename})
          await saveImageToMediaLibrary({uri: filename})
          await FS.deleteAsync(filename)
        } catch (e: unknown) {
          Toast.show(_(msg`An error occurred while saving the QR code!`))
          logger.error('Failed to save QR code', {error: e})
          return
        }
      } else {
        setIsProcessing(true)

        if (!AppBskyGraphStarterpack.isRecord(starterPack.record)) {
          return
        }

        const canvas = await getCanvas(uri)
        const imgHref = canvas
          .toDataURL('image/png')
          .replace('image/png', 'image/octet-stream')

        const link = document.createElement('a')
        link.setAttribute(
          'download',
          `${starterPack.record.name.replaceAll(' ', '_')}_Share_Card.png`,
        )
        link.setAttribute('href', imgHref)
        link.click()
      }

      logEvent('starterPack:share', {
        starterPack: starterPack.uri,
        shareType: 'qrcode',
        qrShareType: 'save',
      })
      setIsProcessing(false)
      Toast.show(
        isWeb
          ? _(msg`QR code has been downloaded!`)
          : _(msg`QR code saved to your camera roll!`),
      )
      control.close()
    })
  }

  const onCopyPress = async () => {
    setIsProcessing(true)
    ref.current?.capture?.().then(async (uri: string) => {
      const canvas = await getCanvas(uri)
      // @ts-expect-error web only
      canvas.toBlob((blob: Blob) => {
        const item = new ClipboardItem({'image/png': blob})
        navigator.clipboard.write([item])
      })

      logEvent('starterPack:share', {
        starterPack: starterPack.uri,
        shareType: 'qrcode',
        qrShareType: 'copy',
      })
      Toast.show(_(msg`QR code copied to your clipboard!`))
      setIsProcessing(false)
      control.close()
    })
  }

  const onSharePress = async () => {
    ref.current?.capture?.().then(async (uri: string) => {
      control.close(() => {
        Sharing.shareAsync(uri, {mimeType: 'image/png', UTI: 'image/png'}).then(
          () => {
            logEvent('starterPack:share', {
              starterPack: starterPack.uri,
              shareType: 'qrcode',
              qrShareType: 'share',
            })
          },
        )
      })
    })
  }

  return (
    <Dialog.Outer
      control={control}
      onClose={() => {
        setIsOpen(false)
      }}>
      <Dialog.Handle />
      <Dialog.ScrollableInner
        label={_(msg`Create a QR code for a starter pack`)}>
        <View style={[a.flex_1, a.align_center, a.gap_5xl]}>
          {!link ? (
            <View style={[a.align_center, a.p_xl]}>
              <Loader size="xl" />
            </View>
          ) : (
            <>
              <QrCode starterPack={starterPack} link={link} ref={ref} />
              {isProcessing ? (
                <View>
                  <Loader size="xl" />
                </View>
              ) : (
                <View style={[a.w_full, a.gap_md]}>
                  <Button
                    label={_(msg`Copy QR code`)}
                    variant="solid"
                    color="primary"
                    size="medium"
                    onPress={isWeb ? onCopyPress : onSharePress}>
                    <ButtonText>
                      {isWeb ? <Trans>Copy</Trans> : <Trans>Share</Trans>}
                    </ButtonText>
                  </Button>
                  <Button
                    label={_(msg`Save QR code`)}
                    variant="solid"
                    color="secondary"
                    size="medium"
                    onPress={onSavePress}>
                    <ButtonText>
                      <Trans>Save</Trans>
                    </ButtonText>
                  </Button>
                </View>
              )}
            </>
          )}
        </View>
      </Dialog.ScrollableInner>
    </Dialog.Outer>
  )
}
