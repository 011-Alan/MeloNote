console.log("=== SHEETMUSIC.TSX LOADED ===");
import React, { useEffect } from 'react';
import {
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

import {
  buildSheetMusicHtml,
  getSheetLayout,
  parseSheetNotes,
  getBeatsPerMeasure,
  segmentNotesIntoMeasures,
  type SheetMusicProps,
} from './sheetMusicShared';

export default function SheetMusic({
  notes,
  timeSignature = '4/4',
  detectedTempo,
  musicxml,
  webViewRef,
  onMessage,
  id,
  hideHeader = false,
  hideFooter = false,
  borderless = false,
  score,
  staves,
  selectedNoteId,
  selectedNoteIds,
  selectedMeasureIndex,
  selectedBarId,
  editable = true,
  measuresPerSystem = 2,
}: SheetMusicProps) {
  console.log("SHEET COMPONENT EXECUTING", { selectedBarId, selectedMeasureIndex, selectedNoteId });

  const {
    bassCount,
    parsedNotes,
    skippedCount,
    trebleCount,
  } = parseSheetNotes(notes);

  const beats = getBeatsPerMeasure(timeSignature);
  
  let measureCount = 0;
  let hasNotes = false;
  let totalNotesCount = 0;

  if (musicxml) {
    measureCount = (musicxml.match(/<measure\b/g) || []).length;
    hasNotes = true;
    if (parsedNotes && !Array.isArray(parsedNotes)) {
      totalNotesCount = parsedNotes.treble.filter(n => n.pitch !== 'rest').length + parsedNotes.bass.filter(n => n.pitch !== 'rest').length;
    } else if (Array.isArray(parsedNotes)) {
      totalNotesCount = parsedNotes.filter(n => n.pitch !== 'rest').length;
    }
  } else if (parsedNotes && !Array.isArray(parsedNotes)) {
    const trebleMeasures = segmentNotesIntoMeasures(parsedNotes.treble, beats);
    const bassMeasures = segmentNotesIntoMeasures(parsedNotes.bass, beats);
    measureCount = Math.max(trebleMeasures.length, bassMeasures.length);
    hasNotes = (parsedNotes.treble.length > 0 || parsedNotes.bass.length > 0);
    totalNotesCount = parsedNotes.treble.filter(n => n.pitch !== 'rest').length + parsedNotes.bass.filter(n => n.pitch !== 'rest').length;
  } else {
    const measures = segmentNotesIntoMeasures(parsedNotes as any[], beats);
    measureCount = measures.length;
    hasNotes = (parsedNotes as any[]).length > 0;
    totalNotesCount = (parsedNotes as any[]).filter(n => n.pitch !== 'rest').length;
  }

  const { height } =
    getSheetLayout(
      measureCount,
      measuresPerSystem
    );

  console.log("MEASURE COUNT =", measureCount);
  console.log("WEBVIEW HEIGHT =", height);

  // WebView source is memoized and loaded only once to avoid reloads and flicker.
  const webViewSource = React.useMemo(() => {
    console.log('[WEBVIEW] Initializing webViewSource');
    return {
      html: buildSheetMusicHtml(
        parsedNotes,
        timeSignature,
        detectedTempo,
        musicxml,
        undefined,
        null,
        null,
        selectedNoteIds,
        editable,
        measuresPerSystem
      ),
      baseUrl: 'https://cdn.jsdelivr.net/',
    };
  }, []);

  const [isReady, setIsReady] = React.useState(false);

  useEffect(() => {
    if (isReady && webViewRef && webViewRef.current) {
      console.log('[SHEET] WebView reported HTML LOADED. Sending initial setup...');
      try {
        console.log(
          "[RN SEND XML]",
          {
            length: musicxml?.length,
            preview: musicxml?.substring(0,100)
          }
        );
        webViewRef.current.postMessage(JSON.stringify({
          type: 'UPDATE_XML',
          musicxml: musicxml
        }));
        console.log(
          "[RN SEND XML]",
          {
            length: musicxml?.length,
            preview: musicxml?.substring(0,100)
          }
        );
        webViewRef.current.postMessage(JSON.stringify({
          type: 'SET_EDIT_MODE',
          editable: editable
        }));
        console.log(
          "[RN SEND XML]",
          {
            length: musicxml?.length,
            preview: musicxml?.substring(0,100)
          }
        );
        webViewRef.current.postMessage(JSON.stringify({
          type: 'UPDATE_TEMPO',
          tempo: detectedTempo
        }));
        console.log(
          "[RN SEND XML]",
          {
            length: musicxml?.length,
            preview: musicxml?.substring(0,100)
          }
        );
        webViewRef.current.postMessage(JSON.stringify({
          type: 'UPDATE_TIME_SIGNATURE',
          timeSignature: timeSignature
        }));

        // Selection
        if (selectedBarId) {
          const parts = selectedBarId.split('_');
          const staffPart = parts[0];
          const measurePart = parts[1];
          let staffNumber = 1;
          if (staffPart === 'treble') {
            staffNumber = 1;
          } else if (staffPart === 'bass') {
            staffNumber = 2;
          } else {
            staffNumber = parseInt(staffPart.replace('staff', '')) || 1;
          }
          const measureNumber = parseInt(measurePart.replace('m', '')) || 1;
          console.log(
            "[RN SEND XML]",
            {
              length: musicxml?.length,
              preview: musicxml?.substring(0,100)
            }
          );
          webViewRef.current.postMessage(JSON.stringify({
            type: 'SELECT_BAR',
            selectionId: selectedBarId,
            staffNumber: staffNumber,
            measureNumber: measureNumber
          }));
        } else if (selectedNoteIds && selectedNoteIds.length > 0) {
          console.log(
            "[RN SEND XML]",
            {
              length: musicxml?.length,
              preview: musicxml?.substring(0,100)
            }
          );
          webViewRef.current.postMessage(JSON.stringify({
            type: 'SELECT_NOTES',
            noteIds: selectedNoteIds
          }));
        } else if (selectedNoteId) {
          console.log(
            "[RN SEND XML]",
            {
              length: musicxml?.length,
              preview: musicxml?.substring(0,100)
            }
          );
          webViewRef.current.postMessage(JSON.stringify({
            type: 'SELECT_NOTE',
            noteId: selectedNoteId
          }));
        }
      } catch (e) {
        console.warn('[WEBVIEW] Error sending initial setup data:', e);
      }
    }
  }, [isReady]);

  useEffect(() => {
    console.log('[SHEET] Mounted / Props updated');
  }, []);

  const lastEditableRef = React.useRef(editable);
  useEffect(() => {
    if (isReady && editable !== undefined && editable !== lastEditableRef.current) {
      console.log('[SHEET] editable changed, posting SET_EDIT_MODE to webview:', editable);
      lastEditableRef.current = editable;
      if (webViewRef && webViewRef.current) {
        try {
          console.log(
            "[RN SEND XML]",
            {
              length: musicxml?.length,
              preview: musicxml?.substring(0,100)
            }
          );
          webViewRef.current.postMessage(JSON.stringify({
            type: 'SET_EDIT_MODE',
            editable: editable
          }));
        } catch (e) {
          console.warn('[WEBVIEW] Error posting SET_EDIT_MODE:', e);
        }
      }
    }
  }, [editable, isReady]);

  const lastMusicXMLRef = React.useRef(musicxml);
  useEffect(() => {
    if (isReady && musicxml && musicxml !== lastMusicXMLRef.current) {
      console.log('[SHEET] musicxml changed, posting UPDATE_XML to webview');
      lastMusicXMLRef.current = musicxml;
      if (webViewRef && webViewRef.current) {
        try {
          console.log(
            "[RN SEND XML]",
            {
              length: musicxml?.length,
              preview: musicxml?.substring(0,100)
            }
          );
          webViewRef.current.postMessage(JSON.stringify({
            type: 'UPDATE_XML',
            musicxml: musicxml
          }));
        } catch (e) {
          console.warn('[WEBVIEW] Error posting UPDATE_XML:', e);
        }
      }
    }
  }, [musicxml, isReady]);

  const lastTempoRef = React.useRef(detectedTempo);
  useEffect(() => {
    if (isReady && detectedTempo !== undefined && detectedTempo !== lastTempoRef.current) {
      console.log('[SHEET] detectedTempo changed, posting UPDATE_TEMPO to webview:', detectedTempo);
      lastTempoRef.current = detectedTempo;
      if (webViewRef && webViewRef.current) {
        try {
          console.log(
            "[RN SEND XML]",
            {
              length: musicxml?.length,
              preview: musicxml?.substring(0,100)
            }
          );
          webViewRef.current.postMessage(JSON.stringify({
            type: 'UPDATE_TEMPO',
            tempo: detectedTempo
          }));
        } catch (e) {
          console.warn('[WEBVIEW] Error posting UPDATE_TEMPO:', e);
        }
      }
    }
  }, [detectedTempo, isReady]);

  const lastTimeSignatureRef = React.useRef(timeSignature);
  useEffect(() => {
    if (isReady && timeSignature && timeSignature !== lastTimeSignatureRef.current) {
      console.log('[SHEET] timeSignature changed, posting UPDATE_TIME_SIGNATURE to webview:', timeSignature);
      lastTimeSignatureRef.current = timeSignature;
      if (webViewRef && webViewRef.current) {
        try {
          console.log(
            "[RN SEND XML]",
            {
              length: musicxml?.length,
              preview: musicxml?.substring(0,100)
            }
          );
          webViewRef.current.postMessage(JSON.stringify({
            type: 'UPDATE_TIME_SIGNATURE',
            timeSignature: timeSignature
          }));
        } catch (e) {
          console.warn('[WEBVIEW] Error posting UPDATE_TIME_SIGNATURE:', e);
        }
      }
    }
  }, [timeSignature, isReady]);

  useEffect(() => {
    if (!isReady || !webViewRef || !webViewRef.current) return;
    console.log("SELECTION CHANGED (posting to webview)", {
      selectedBarId,
      selectedNoteId,
      selectedNoteIds,
      source: "SheetMusic useEffect [selectedBarId, selectedNoteId, selectedNoteIds]"
    });
    try {
      if (selectedBarId) {
        const parts = selectedBarId.split('_');
        const staffPart = parts[0];
        const measurePart = parts[1];
        let staffNumber = 1;
        if (staffPart === 'treble') {
          staffNumber = 1;
        } else if (staffPart === 'bass') {
          staffNumber = 2;
        } else {
          staffNumber = parseInt(staffPart.replace('staff', '')) || 1;
        }
        const measureNumber = parseInt(measurePart.replace('m', '')) || 1;
        console.log(
          "[RN SEND XML]",
          {
            length: musicxml?.length,
            preview: musicxml?.substring(0,100)
          }
        );
        webViewRef.current.postMessage(JSON.stringify({
          type: 'SELECT_BAR',
          selectionId: selectedBarId,
          staffNumber: staffNumber,
          measureNumber: measureNumber
        }));
      } else if (selectedNoteIds && selectedNoteIds.length > 0) {
        console.log(
          "[RN SEND XML]",
          {
            length: musicxml?.length,
            preview: musicxml?.substring(0,100)
          }
        );
        webViewRef.current.postMessage(JSON.stringify({
          type: 'SELECT_NOTES',
          noteIds: selectedNoteIds
        }));
      } else if (selectedNoteId) {
        console.log(
          "[RN SEND XML]",
          {
            length: musicxml?.length,
            preview: musicxml?.substring(0,100)
          }
        );
        webViewRef.current.postMessage(JSON.stringify({
          type: 'SELECT_NOTE',
          noteId: selectedNoteId
        }));
      } else {
        console.log(
          "[RN SEND XML]",
          {
            length: musicxml?.length,
            preview: musicxml?.substring(0,100)
          }
        );
        webViewRef.current.postMessage(JSON.stringify({
          type: 'CLEAR_SELECTION'
        }));
      }
    } catch (e) {
      console.warn('[WEBVIEW] Error posting selection message:', e);
    }
  }, [selectedBarId, selectedNoteId, selectedNoteIds, isReady]);

  console.log("musicxml exists:", !!musicxml);
  console.log("musicxml length:", musicxml?.length);
  // if (musicxml) {
  //   console.log("musicxml preview:", musicxml.substring(0, 500));
  // }
  console.log('[SHEET] Rendering');
  console.log('[SHEET] XML length:', musicxml?.length);
  console.log("SHEET RETURNING JSX");
  return (
    <View
      style={{
        width: '100%',
        backgroundColor: 'white',
        borderRadius: borderless ? 0 : 28,
        paddingVertical: borderless ? 0 : 20,
        paddingHorizontal: borderless ? 0 : 18,
        borderWidth: borderless ? 0 : 1,
        borderColor: '#d4d4d8',
      }}
    >
      {!hideHeader && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent:
              'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <View
            style={{
              flex: 1,
              paddingRight: 12,
            }}
          >
            <Text
              style={{
                color: '#111111',
                fontSize: 22,
                fontWeight: '700',
              }}
            >
              Notation Preview
            </Text>

            <Text
              style={{
                color: '#52525b',
                marginTop: 4,
              }}
            >
              Rendered as real sheet
              music, not note names
            </Text>
          </View>

          <View
            style={{
              backgroundColor:
                '#f4f4f5',
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 7,
            }}
          >
            <Text
              style={{
                color: '#111111',
                fontWeight: '700',
              }}
            >
              {totalNotesCount} notes
            </Text>
          </View>
        </View>
      )}

      <WebView
        key="sheet-music-webview"
        ref={webViewRef}
        onMessage={(event) => {
          const msgData = event.nativeEvent.data;
          console.log('[SHEET] WebView posted message:', msgData);
          if (msgData === 'HTML LOADED') {
            console.log(
              "[RN READY RECEIVED]"
            );
            setIsReady(true);
          }
          try {
            const data = typeof msgData === 'string' ? JSON.parse(msgData) : msgData;
            if (data && data.type === 'TEMPO_CHANGE' && data.tempo !== undefined) {
              console.log('[SHEET] WebView initiated TEMPO_CHANGE, syncing lastTempoRef:', data.tempo);
              lastTempoRef.current = data.tempo;
            }
          } catch (e) {
            // Not JSON
          }
          if (onMessage) {
            onMessage(event);
          }
        }}
        originWhitelist={[
          '*',
        ]}
        source={webViewSource}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        nestedScrollEnabled={true}
        scrollEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowUniversalAccessFromFileURLs={true}
        allowFileAccess={true}
        mixedContentMode="always"
        onError={(e) => console.error('[WEBVIEW ERROR]', e.nativeEvent)}
        onHttpError={(e) => console.error('[WEBVIEW HTTP ERROR]', e.nativeEvent)}
        style={{
          height: Math.min(height, 650),
          width: '100%',
          backgroundColor: 'white',
        }}
      />

      {!hideFooter && (
        <>
          <Text
            style={{
              color: '#52525b',
              marginTop: 12,
              fontSize: 13,
            }}
          >
            Treble: {trebleCount} | Bass:{' '}
            {bassCount}
          </Text>

          {skippedCount > 0 ? (
            <Text
              style={{
                color: '#b91c1c',
                marginTop: 6,
                fontSize: 13,
              }}
            >
              Skipped {skippedCount}{' '}
              note
              {skippedCount === 1
                ? ''
                : 's'}{' '}
              that could not be
              notated.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
