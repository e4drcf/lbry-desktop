// @flow
import * as MODALS from 'constants/modal_types';
import * as ICONS from 'constants/icons';
import React, { useRef } from 'react';
import { parseURI } from 'lbry-redux';
import Button from 'component/button';
import useHover from 'util/use-hover';

type SubscriptionArgs = {
  channelName: string,
  uri: string,
};

type Props = {
  uri: string,
  isSubscribed: boolean,
  subscriptions: Array<string>,
  doChannelSubscribe: ({ channelName: string, uri: string }) => void,
  doChannelUnsubscribe: SubscriptionArgs => void,
  doOpenModal: (id: string) => void,
  showSnackBarOnSubscribe: boolean,
  doToast: ({ message: string }) => void,
};

export default function SubscribeButton(props: Props) {
  const {
    uri,
    doChannelSubscribe,
    doChannelUnsubscribe,
    doOpenModal,
    subscriptions,
    isSubscribed,
    showSnackBarOnSubscribe,
    doToast,
  } = props;
  const buttonRef = useRef();
  const isHovering = useHover(buttonRef);
  const { claimName } = parseURI(uri);
  const subscriptionHandler = isSubscribed ? doChannelUnsubscribe : doChannelSubscribe;
  const subscriptionLabel = isSubscribed ? __('Following') : __('Follow');
  const unfollowOverride = isSubscribed && isHovering && __('Unfollow');

  return (
    <Button
      ref={buttonRef}
      iconColor="red"
      icon={unfollowOverride ? ICONS.UNSUBSCRIBE : ICONS.SUBSCRIBE}
      button={'alt'}
      label={unfollowOverride || subscriptionLabel}
      onClick={e => {
        e.stopPropagation();

        if (!subscriptions.length) {
          doOpenModal(MODALS.FIRST_SUBSCRIPTION);
        }

        subscriptionHandler({
          channelName: claimName,
          uri,
        });

        if (showSnackBarOnSubscribe) {
          doToast({ message: `${__('Now following ')} ${claimName}!` });
        }
      }}
    />
  );
}
