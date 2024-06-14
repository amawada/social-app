import React from 'react'
import {
  findNodeHandle,
  ListRenderItemInfo,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useQueryClient} from '@tanstack/react-query'

import {cleanError} from '#/lib/strings/errors'
import {logger} from '#/logger'
import {isNative} from '#/platform/detection'
import {RQKEY, useProfileFeedgensQuery} from '#/state/queries/profile-feedgens'
import {useBottomBarOffset} from 'lib/hooks/useBottomBarOffset'
import {useWebMediaQueries} from 'lib/hooks/useWebMediaQueries'
import {FeedLoadingPlaceholder} from '#/view/com/util/LoadingPlaceholder'
import {EmptyState} from 'view/com/util/EmptyState'
import {atoms as a, useTheme} from '#/alf'
import * as FeedCard from '#/components/FeedCard'
import {ErrorMessage} from '../util/error/ErrorMessage'
import {List, ListRef} from '../util/List'
import {LoadMoreRetryBtn} from '../util/LoadMoreRetryBtn'

const LOADING = {_reactKey: '__loading__'}
const EMPTY = {_reactKey: '__empty__'}
const ERROR_ITEM = {_reactKey: '__error__'}
const LOAD_MORE_ERROR_ITEM = {_reactKey: '__load_more_error__'}

interface SectionRef {
  scrollToTop: () => void
}

interface ProfileFeedgensProps {
  did: string
  scrollElRef: ListRef
  headerOffset: number
  enabled?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  setScrollViewTag: (tag: number | null) => void
}

export const ProfileFeedgens = React.forwardRef<
  SectionRef,
  ProfileFeedgensProps
>(function ProfileFeedgensImpl(
  {did, scrollElRef, headerOffset, enabled, style, testID, setScrollViewTag},
  ref,
) {
  const {_} = useLingui()
  const t = useTheme()
  const {isTabletOrDesktop} = useWebMediaQueries()
  const bottomBarOffset = useBottomBarOffset(100)
  const [isPTRing, setIsPTRing] = React.useState(false)
  const opts = React.useMemo(() => ({enabled}), [enabled])
  const {
    data,
    isFetching,
    isFetched,
    hasNextPage,
    fetchNextPage,
    isError,
    error,
    refetch,
  } = useProfileFeedgensQuery(did, opts)
  const isEmpty = !isFetching && !data?.pages[0]?.feeds.length

  const items = React.useMemo(() => {
    let items: any[] = []
    if (isError && isEmpty) {
      items = items.concat([ERROR_ITEM])
    }
    if (!isFetched && isFetching) {
      items = items.concat([LOADING])
    } else if (isEmpty) {
      items = items.concat([EMPTY])
    } else if (data?.pages) {
      for (const page of data?.pages) {
        items = items.concat(page.feeds)
      }
    } else if (isError && !isEmpty) {
      items = items.concat([LOAD_MORE_ERROR_ITEM])
    }
    return items
  }, [isError, isEmpty, isFetched, isFetching, data])

  // events
  // =

  const queryClient = useQueryClient()

  const onScrollToTop = React.useCallback(() => {
    scrollElRef.current?.scrollToOffset({
      animated: isNative,
      offset: -headerOffset,
    })
    queryClient.invalidateQueries({queryKey: RQKEY(did)})
  }, [scrollElRef, queryClient, headerOffset, did])

  React.useImperativeHandle(ref, () => ({
    scrollToTop: onScrollToTop,
  }))

  const onRefresh = React.useCallback(async () => {
    setIsPTRing(true)
    try {
      await refetch()
    } catch (err) {
      logger.error('Failed to refresh feeds', {message: err})
    }
    setIsPTRing(false)
  }, [refetch, setIsPTRing])

  const onEndReached = React.useCallback(async () => {
    if (isFetching || !hasNextPage || isError) return

    try {
      await fetchNextPage()
    } catch (err) {
      logger.error('Failed to load more feeds', {message: err})
    }
  }, [isFetching, hasNextPage, isError, fetchNextPage])

  const onPressRetryLoadMore = React.useCallback(() => {
    fetchNextPage()
  }, [fetchNextPage])

  // rendering
  // =

  const renderItem = ({item, index}: ListRenderItemInfo<any>) => {
    if (item === EMPTY) {
      return (
        <EmptyState
          icon="hashtag"
          message={_(msg`You have no feeds.`)}
          testID="listsEmpty"
        />
      )
    } else if (item === ERROR_ITEM) {
      return (
        <ErrorMessage message={cleanError(error)} onPressTryAgain={refetch} />
      )
    } else if (item === LOAD_MORE_ERROR_ITEM) {
      return (
        <LoadMoreRetryBtn
          label={_(
            msg`There was an issue fetching your lists. Tap here to try again.`,
          )}
          onPress={onPressRetryLoadMore}
        />
      )
    } else if (item === LOADING) {
      return <FeedLoadingPlaceholder />
    }
    return (
      <View
        style={[
          (index !== 0 || isTabletOrDesktop) && a.border_t,
          t.atoms.border_contrast_low,
          a.px_lg,
          a.py_lg,
        ]}>
        <FeedCard.Default feed={item} />
      </View>
    )
  }

  React.useEffect(() => {
    if (enabled && scrollElRef.current) {
      const nativeTag = findNodeHandle(scrollElRef.current)
      setScrollViewTag(nativeTag)
    }
  }, [enabled, scrollElRef, setScrollViewTag])

  return (
    <View testID={testID} style={style}>
      <List
        testID={testID ? `${testID}-flatlist` : undefined}
        ref={scrollElRef}
        data={items}
        keyExtractor={(item: any) => item._reactKey || item.uri}
        renderItem={renderItem}
        refreshing={isPTRing}
        onRefresh={onRefresh}
        headerOffset={headerOffset}
        contentContainerStyle={
          isNative && {paddingBottom: headerOffset + bottomBarOffset}
        }
        indicatorStyle={t.name === 'light' ? 'black' : 'white'}
        removeClippedSubviews={true}
        // @ts-ignore our .web version only -prf
        desktopFixedHeight
        onEndReached={onEndReached}
      />
    </View>
  )
})
