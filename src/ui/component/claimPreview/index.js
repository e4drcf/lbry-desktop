import { connect } from 'react-redux';
import {
  doResolveUri,
  makeSelectClaimForUri,
  makeSelectIsUriResolving,
  makeSelectClaimIsMine,
  makeSelectClaimIsPending,
  makeSelectThumbnailForUri,
  makeSelectTitleForUri,
  makeSelectClaimIsNsfw,
  selectBlockedChannels,
  selectChannelIsBlocked,
} from 'lbry-redux';
import { selectBlackListedOutpoints, selectFilteredOutpoints } from 'lbryinc';
import { selectShowNsfw } from 'redux/selectors/settings';
import { makeSelectHasVisitedUri } from 'redux/selectors/content';
import { makeSelectIsSubscribed } from 'redux/selectors/subscriptions';
import ClaimPreview from './view';

const select = (state, props) => ({
  pending: makeSelectClaimIsPending(props.uri)(state),
  claim: makeSelectClaimForUri(props.uri)(state),
  obscureNsfw: !selectShowNsfw(state),
  claimIsMine: makeSelectClaimIsMine(props.uri)(state),
  isResolvingUri: makeSelectIsUriResolving(props.uri)(state),
  thumbnail: makeSelectThumbnailForUri(props.uri)(state),
  title: makeSelectTitleForUri(props.uri)(state),
  nsfw: makeSelectClaimIsNsfw(props.uri)(state),
  blackListedOutpoints: selectBlackListedOutpoints(state),
  filteredOutpoints: selectFilteredOutpoints(state),
  blockedChannelUris: selectBlockedChannels(state),
  hasVisitedUri: makeSelectHasVisitedUri(props.uri)(state),
  channelIsBlocked: selectChannelIsBlocked(props.uri)(state),
  isSubscribed: makeSelectIsSubscribed(props.uri, true)(state),
});

const perform = dispatch => ({
  resolveUri: uri => dispatch(doResolveUri(uri)),
});

export default connect(
  select,
  perform
)(ClaimPreview);
