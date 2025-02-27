// @flow
import type { ElementRef } from 'react';
import '@babel/polyfill';
import * as React from 'react';

// @if TARGET='app'
import fs from 'fs';
import { remote } from 'electron';
// @endif

import path from 'path';
import player from 'render-media';
import FileRender from 'component/fileRender';
import LoadingScreen from 'component/common/loading-screen';
import detectTyping from 'util/detect-typing';
import { fullscreenElement, requestFullscreen, exitFullscreen } from 'util/full-screen';

// Shorcut key code for fullscreen (f)
const F_KEYCODE = 70;

type Props = {
  contentType: string,
  mediaType: string,
  downloadCompleted: boolean,
  volume: number,
  position: ?number,
  downloadPath: string,
  fileName: string,
  claim: StreamClaim,
  onStartCb: ?() => void,
  onFinishCb: ?() => void,
  savePosition: number => void,
  changeVolume: number => void,
  viewerContainer: { current: ElementRef<any> },
  changeMute: boolean => void,
  muted: boolean,
};

type State = {
  hasMetadata: boolean,
  unplayable: boolean,
  fileSource: ?{
    url?: string,
    fileName?: string,
    contentType?: string,
    downloadPath?: string,
    fileType?: string,
    // Just using `any` because flow isn't working with `fs.createReadStream`
    stream?: ({}) => any,
  },
};

class MediaPlayer extends React.PureComponent<Props, State> {
  static SANDBOX_TYPES = ['application/x-lbry', 'application/x-ext-lbry'];
  static FILE_MEDIA_TYPES = [
    'text',
    'script',
    'e-book',
    'comic-book',
    'document',
    '3D-file',
    // @if TARGET='web'
    'video',
    'audio',
    // @endif
  ];
  static SANDBOX_SET_BASE_URL = 'http://localhost:5278/set/';
  static SANDBOX_CONTENT_BASE_URL = 'http://localhost:5278';

  mediaContainer: { current: React.ElementRef<any> };

  constructor(props: Props) {
    super(props);

    this.state = {
      hasMetadata: false,
      unplayable: false,
      fileSource: null,
    };

    this.mediaContainer = React.createRef();
    (this: any).togglePlay = this.togglePlay.bind(this);
  }

  componentDidMount() {
    this.playMedia();
    // Temp hack to force the video to play if the metadataloaded event was never fired
    // Will be removed with the new video player
    // Unoptimized MP4s will fail to render.
    // Note: Don't use this for non-playable files
    // @if TARGET='app'
    setTimeout(() => {
      const { hasMetadata } = this.state;
      const isPlayableType = this.playableType();
      if (!hasMetadata && isPlayableType) {
        this.refreshMetadata();
        this.playMedia();
      }
    }, 5000);
    // @endif

    // Register handler for custom shortcut keys
    document.addEventListener('keydown', this.handleKeyDown);
  }

  componentDidUpdate(prevProps: Props) {
    const { fileSource } = this.state;
    const { downloadCompleted } = this.props;

    // Attemp to render a non-playable file once download is completed
    if (prevProps.downloadCompleted !== downloadCompleted) {
      const isFileType = this.isSupportedFile();

      if (isFileType && !fileSource && downloadCompleted) {
        this.playMedia();
      }
    }
  }

  componentWillUnmount() {
    const mediaElement = this.mediaContainer.current.children[0];

    if (mediaElement) {
      mediaElement.removeEventListener('click', this.togglePlay);
      mediaElement.removeEventListener('dbclick', this.handleDoubleClick);
    }

    document.removeEventListener('keydown', this.handleKeyDown);
  }

  handleKeyDown = (event: KeyboardEvent) => {
    if (!detectTyping()) {
      // Handle fullscreen shortcut key (f)
      if (event.keyCode === F_KEYCODE) {
        this.toggleFullscreen();
      }
      // Handle toggle play
      // @if TARGET='app'
      this.togglePlay(event);
      // @endif
    }
  };

  handleDoubleClick = (event: SyntheticInputEvent<*>) => {
    // Prevent pause / play
    event.preventDefault();
    event.stopPropagation();
    // Trigger fullscreen mode
    this.toggleFullscreen();
  };

  toggleFullscreen = () => {
    const { viewerContainer } = this.props;
    const isFullscreen = fullscreenElement();
    const isSupportedFile = this.isSupportedFile();
    const isPlayableType = this.playableType();

    if (!isFullscreen) {
      // Enter fullscreen mode if content is not playable
      // Otherwise it should be handle internally on the video player
      // or it will break the toggle fullscreen button
      if (!isPlayableType && isSupportedFile && viewerContainer && viewerContainer.current !== null) {
        requestFullscreen(viewerContainer.current);
      }
      // Request fullscreen mode for the media player (renderMedia)
      // Don't use this with the new player
      // @if TARGET='app'
      else if (isPlayableType) {
        const mediaContainer = this.mediaContainer.current;
        const mediaElement = mediaContainer && mediaContainer.children[0];
        if (mediaElement) {
          requestFullscreen(mediaElement);
        }
      }
      // @endif
    } else {
      exitFullscreen();
    }
  };

  async playMedia() {
    const container = this.mediaContainer.current;
    const {
      downloadCompleted,
      changeVolume,
      volume,
      position,
      onFinishCb,
      savePosition,
      downloadPath,
      fileName,
      muted,
      changeMute,
    } = this.props;

    // @if TARGET='app'
    const renderMediaCallback = error => {
      if (error) this.setState({ unplayable: true });
    };

    // Handle fullscreen change for the Windows platform
    const win32FullScreenChange = () => {
      const win = remote.BrowserWindow.getFocusedWindow();
      if (process.platform === 'win32') {
        // $FlowFixMe
        win.setMenu(document.webkitIsFullScreen ? null : remote.Menu.getApplicationMenu());
      }
    };

    // Render custom viewer: FileRender
    if (this.isSupportedFile()) {
      if (downloadCompleted) {
        this.renderFile();
      }
    } else {
      // Render default viewer: render-media (video, audio, img, iframe)
      const currentMediaContainer = this.mediaContainer.current;

      // Clean any potential rogue instances
      while (currentMediaContainer.firstChild) {
        currentMediaContainer.removeChild(currentMediaContainer.firstChild);
      }

      // A slight delay is a hacky way to improve support for videos that aren't web-optimized
      // Works... slightly better than not having it ¯\_(ツ)_/¯
      await this.sleep(400);

      player.append(
        {
          name: fileName,
          createReadStream: opts => fs.createReadStream(downloadPath, opts),
        },
        container,
        { autoplay: true, controls: true },
        renderMediaCallback.bind(this)
      );
    }

    const mediaElement = container.children[0];
    if (mediaElement) {
      if (position) {
        mediaElement.currentTime = position;
      }

      mediaElement.addEventListener('loadedmetadata', () => this.refreshMetadata(), {
        once: true,
      });
      mediaElement.addEventListener('timeupdate', () => savePosition(mediaElement.currentTime));
      mediaElement.addEventListener('click', this.togglePlay);
      mediaElement.addEventListener('ended', () => {
        if (onFinishCb) {
          onFinishCb();
        }
        savePosition(0);
      });
      mediaElement.addEventListener('webkitfullscreenchange', win32FullScreenChange.bind(this));
      mediaElement.addEventListener('volumechange', () => {
        changeMute(mediaElement.muted);
        changeVolume(mediaElement.volume);
      });
      mediaElement.volume = volume;
      mediaElement.muted = muted;
      mediaElement.addEventListener('dblclick', this.handleDoubleClick);
    }
    // @endif

    // On the web, we have viewers for every file like normal people

    // @if TARGET='web'
    if (this.isSupportedFile()) {
      this.renderFile();
    }
    // @endif
  }

  // @if TARGET='app'
  sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
  }

  refreshMetadata() {
    const { onStartCb } = this.props;
    this.setState({ hasMetadata: true });

    if (onStartCb) {
      onStartCb();
    }
    const playerElement = this.mediaContainer.current;
    if (playerElement) {
      if (playerElement.children && playerElement.children[0]) {
        playerElement.children[0].play();
      }
    }
  }
  // @endif

  togglePlay(event: any) {
    // ignore all events except click and spacebar keydown, or input events in a form control
    if (
      event.type === 'keydown' &&
      (event.code !== 'Space' || (event.target && event.target.tagName.toLowerCase() === 'input'))
    ) {
      return;
    }
    event.preventDefault();

    const mediaRef = this.mediaContainer.current;

    if (!mediaRef) {
      return;
    }

    const mediaElement = mediaRef.children && mediaRef.children[0];
    if (mediaElement) {
      if (!mediaElement.paused) {
        mediaElement.pause();
      } else {
        mediaElement.play();
      }
    }
  }

  playableType(): boolean {
    const { mediaType } = this.props;
    return ['audio', 'video', 'image'].indexOf(mediaType) !== -1;
  }

  isRenderMediaSupported() {
    // Files supported by render-media
    const { contentType } = this.props;
    return Object.values(player.mime).indexOf(contentType) !== -1;
  }

  isSupportedFile() {
    // This files are supported using a custom viewer
    const { mediaType, contentType } = this.props;

    return MediaPlayer.FILE_MEDIA_TYPES.indexOf(mediaType) > -1 || MediaPlayer.SANDBOX_TYPES.indexOf(contentType) > -1;
  }

  renderFile() {
    // This is what render-media does with unplayable files
    const { claim, fileName, downloadPath, contentType } = this.props;

    if (MediaPlayer.SANDBOX_TYPES.indexOf(contentType) > -1) {
      const outpoint = `${claim.txid}:${claim.nout}`;
      // Fetch unpacked url
      fetch(`${MediaPlayer.SANDBOX_SET_BASE_URL}${outpoint}`)
        .then(res => res.text())
        .then(url => {
          const fileSource = { url: `${MediaPlayer.SANDBOX_CONTENT_BASE_URL}${url}` };
          this.setState({ fileSource });
        })
        .catch(err => {
          console.error(err);
        });
    } else {
      // File to render
      const fileSource = {
        fileName,
        contentType,
        downloadPath,
        fileType: path.extname(fileName).substring(1),
        // Readable stream from file
        // @if TARGET='app'
        stream: opts => fs.createReadStream(downloadPath, opts),
        // @endif
      };

      // Update state
      this.setState({ fileSource });
    }
  }

  showLoadingScreen(isFileType: boolean, isPlayableType: boolean) {
    const { mediaType } = this.props;
    const { unplayable, fileSource, hasMetadata } = this.state;

    if (IS_WEB && ['audio', 'video'].indexOf(mediaType) === -1) {
      return {
        isLoading: false,
        loadingStatus: __('This file type is not currently supported on lbry.tv. Try viewing it in the desktop app.'),
      };
    }

    const loader: { isLoading: boolean, loadingStatus: ?string } = {
      isLoading: false,
      loadingStatus: null,
    };

    // Loading message
    const noFileMessage = __('Waiting for blob.');
    const noMetadataMessage = __('Waiting for metadata.');

    // Error message
    const unplayableMessage = __("Sorry, looks like we can't play this file.");
    const unsupportedMessage = __("Sorry, looks like we can't preview this file.");

    // Files
    const isLoadingFile = !fileSource && isFileType;
    const isUnsupported = !this.isRenderMediaSupported() && !isFileType && !isPlayableType;
    // Media (audio, video)
    const isUnplayable = isPlayableType && unplayable;
    const isLoadingMetadata = isPlayableType && (!hasMetadata && !unplayable);

    // Show loading message
    if (isLoadingFile || isLoadingMetadata) {
      loader.loadingStatus = isFileType ? noFileMessage : noMetadataMessage;
      loader.isLoading = true;

      // Show unsupported error message
    } else if (isUnsupported || isUnplayable) {
      loader.loadingStatus = isUnsupported ? unsupportedMessage : unplayableMessage;
    }

    return loader;
  }

  render() {
    const { mediaType, claim } = this.props;
    const { fileSource } = this.state;
    const isFileType = this.isSupportedFile();
    const isFileReady = fileSource !== null && isFileType;
    const isPlayableType = this.playableType();
    const { isLoading, loadingStatus } = this.showLoadingScreen(isFileType, isPlayableType);

    return (
      <React.Fragment>
        {loadingStatus && <LoadingScreen status={loadingStatus} spinner={isLoading} />}
        {isFileReady && <FileRender claim={claim} source={fileSource} mediaType={mediaType} />}
        <div className="content__view--container" style={{ opacity: isLoading ? 0 : 1 }} ref={this.mediaContainer} />
      </React.Fragment>
    );
  }
}

export default MediaPlayer;
