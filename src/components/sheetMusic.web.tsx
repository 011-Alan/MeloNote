console.log("=== SHEETMUSIC.WEB.TSX LOADED ===");
import React from 'react';
import {
  Text,
  View,
} from 'react-native';

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
  id,
  hideHeader = false,
  hideFooter = false,
  borderless = false,
  onMessage,
  webViewRef,
  score,
  staves,
  selectedNoteId,
  selectedNoteIds,
  selectedMeasureIndex,
  selectedBarId,
  editable = true,
  measuresPerSystem = 2,
}: SheetMusicProps) {
  console.log("WEB COMPONENT EXECUTING", { selectedBarId, selectedMeasureIndex, selectedNoteId });

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

  // iframe srcDoc is memoized and loaded only once to avoid reloads and flicker.
  const initialSrcDoc = React.useMemo(() => {
    console.log('[WEBVIEW WEB] Initializing srcDoc');
    return buildSheetMusicHtml(
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
    );
  }, []);

  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    if (isReady && webViewRef && webViewRef.current) {
      console.log('[SHEET WEB] WebView reported HTML LOADED. Sending initial setup...');
      try {
        if (webViewRef.current.contentWindow) {
          webViewRef.current.contentWindow.postMessage(JSON.stringify({
            type: 'UPDATE_XML',
            musicxml: musicxml
          }), '*');
          webViewRef.current.contentWindow.postMessage(JSON.stringify({
            type: 'SET_EDIT_MODE',
            editable: editable
          }), '*');
          webViewRef.current.contentWindow.postMessage(JSON.stringify({
            type: 'UPDATE_TEMPO',
            tempo: detectedTempo
          }), '*');
          webViewRef.current.contentWindow.postMessage(JSON.stringify({
            type: 'UPDATE_TIME_SIGNATURE',
            timeSignature: timeSignature
          }), '*');

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
            webViewRef.current.contentWindow.postMessage(JSON.stringify({
              type: 'SELECT_BAR',
              selectionId: selectedBarId,
              staffNumber: staffNumber,
              measureNumber: measureNumber
            }), '*');
          } else if (selectedNoteIds && selectedNoteIds.length > 0) {
            webViewRef.current.contentWindow.postMessage(JSON.stringify({
              type: 'SELECT_NOTES',
              noteIds: selectedNoteIds
            }), '*');
          } else if (selectedNoteId) {
            webViewRef.current.contentWindow.postMessage(JSON.stringify({
              type: 'SELECT_NOTE',
              noteId: selectedNoteId
            }), '*');
          }
        }
      } catch (e) {
        console.warn('[WEBVIEW WEB] Error sending initial setup data:', e);
      }
    }
  }, [isReady]);

  React.useEffect(() => {
    console.log('[SHEET WEB] Mounted / Props updated');
  }, []);

  const lastEditableRef = React.useRef(editable);
  React.useEffect(() => {
    if (isReady && editable !== undefined && editable !== lastEditableRef.current) {
      console.log('[SHEET WEB] editable changed, posting SET_EDIT_MODE to iframe:', editable);
      lastEditableRef.current = editable;
      if (webViewRef && webViewRef.current) {
        try {
          const jsonStr = JSON.stringify({
            type: 'SET_EDIT_MODE',
            editable: editable
          });
          if (webViewRef.current.contentWindow) {
            webViewRef.current.contentWindow.postMessage(jsonStr, '*');
          }
        } catch (e) {
          console.warn('[WEBVIEW WEB] Error posting SET_EDIT_MODE:', e);
        }
      }
    }
  }, [editable, isReady]);

  const lastMusicXMLRef = React.useRef(musicxml);
  React.useEffect(() => {
    if (isReady && musicxml && musicxml !== lastMusicXMLRef.current) {
      console.log('[SHEET WEB] musicxml changed, posting UPDATE_XML to iframe');
      lastMusicXMLRef.current = musicxml;
      if (webViewRef && webViewRef.current) {
        try {
          const jsonStr = JSON.stringify({
            type: 'UPDATE_XML',
            musicxml: musicxml
          });
          if (webViewRef.current.contentWindow) {
            webViewRef.current.contentWindow.postMessage(jsonStr, '*');
          }
        } catch (e) {
          console.warn('[WEBVIEW WEB] Error posting UPDATE_XML:', e);
        }
      }
    }
  }, [musicxml, isReady]);

  const lastTempoRef = React.useRef(detectedTempo);
  React.useEffect(() => {
    if (isReady && detectedTempo !== undefined && detectedTempo !== lastTempoRef.current) {
      console.log('[SHEET WEB] detectedTempo changed, posting UPDATE_TEMPO to iframe:', detectedTempo);
      lastTempoRef.current = detectedTempo;
      if (webViewRef && webViewRef.current) {
        try {
          const jsonStr = JSON.stringify({
            type: 'UPDATE_TEMPO',
            tempo: detectedTempo
          });
          if (webViewRef.current.contentWindow) {
            webViewRef.current.contentWindow.postMessage(jsonStr, '*');
          }
        } catch (e) {
          console.warn('[WEBVIEW WEB] Error posting UPDATE_TEMPO:', e);
        }
      }
    }
  }, [detectedTempo, isReady]);

  const lastTimeSignatureRef = React.useRef(timeSignature);
  React.useEffect(() => {
    if (isReady && timeSignature && timeSignature !== lastTimeSignatureRef.current) {
      console.log('[SHEET WEB] timeSignature changed, posting UPDATE_TIME_SIGNATURE to iframe:', timeSignature);
      lastTimeSignatureRef.current = timeSignature;
      if (webViewRef && webViewRef.current) {
        try {
          const jsonStr = JSON.stringify({
            type: 'UPDATE_TIME_SIGNATURE',
            timeSignature: timeSignature
          });
          if (webViewRef.current.contentWindow) {
            webViewRef.current.contentWindow.postMessage(jsonStr, '*');
          }
        } catch (e) {
          console.warn('[WEBVIEW WEB] Error posting UPDATE_TIME_SIGNATURE:', e);
        }
      }
    }
  }, [timeSignature, isReady]);

  React.useEffect(() => {
    if (!isReady || !webViewRef || !webViewRef.current) return;
    console.log("SELECTION CHANGED (posting to webview)", {
      selectedBarId,
      selectedNoteId,
      selectedNoteIds,
      source: "SheetMusic.web useEffect [selectedBarId, selectedNoteId, selectedNoteIds]"
    });
    try {
      let msg: any = null;
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
        msg = {
          type: 'SELECT_BAR',
          selectionId: selectedBarId,
          staffNumber: staffNumber,
          measureNumber: measureNumber
        };
      } else if (selectedNoteIds && selectedNoteIds.length > 0) {
        msg = {
          type: 'SELECT_NOTES',
          noteIds: selectedNoteIds
        };
      } else if (selectedNoteId) {
        msg = {
          type: 'SELECT_NOTE',
          noteId: selectedNoteId
        };
      } else {
        msg = {
          type: 'CLEAR_SELECTION'
        };
      }
      
      const jsonStr = JSON.stringify(msg);
      if (webViewRef.current.contentWindow) {
        webViewRef.current.contentWindow.postMessage(jsonStr, '*');
      }
    } catch (e) {
      console.warn('[WEBVIEW WEB] Error posting selection message:', e);
    }
  }, [selectedBarId, selectedNoteId, selectedNoteIds, isReady]);

  console.log("musicxml exists:", !!musicxml);
  console.log("musicxml length:", musicxml?.length);
  // if (musicxml) {
  //   console.log("musicxml preview:", musicxml.substring(0, 500));
  // }
  console.log('[SHEET] Rendering');
  console.log('[SHEET] XML length:', musicxml?.length);

  React.useEffect(() => {
    const handleWebMessage = (event: MessageEvent) => {
      if (event.data === 'HTML LOADED') {
        setIsReady(true);
      }
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && data.type) {
          if (data.type === 'TEMPO_CHANGE' && data.tempo !== undefined) {
            console.log('[SHEET WEB] WebView initiated TEMPO_CHANGE, syncing lastTempoRef:', data.tempo);
            lastTempoRef.current = data.tempo;
          }
          if (onMessage) {
            onMessage({ nativeEvent: { data: event.data } });
          }
        }
      } catch (e) {
        // Not our message protocol
      }
    };
    window.addEventListener('message', handleWebMessage);
    return () => window.removeEventListener('message', handleWebMessage);
  }, [onMessage]);

  const frame =
    React.createElement(
      'iframe',
      {
        key: id || 'sheet-music-iframe',
        id: id || 'sheet-music-iframe',
        ref: webViewRef,
        srcDoc: initialSrcDoc,
        allow: 'autoplay; midi',
        style: {
          backgroundColor:
            'white',
          border: 'none',
          borderRadius: borderless ? '0px' : '18px',
          display: 'block',
          height: `${Math.min(height, 650)}px`,
          overflow: 'hidden',
          width: '100%',
        },
        title:
          'Sheet music notation',
      }
    );

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

      {frame}

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
