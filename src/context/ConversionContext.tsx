import React, { createContext, useContext, useState } from 'react';
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { sendLocalNotification } from '@/utils/notifications';
import { saveLatestConversion } from '@/utils/storage';

export type ConversionType = 'transcription' | 'scan';

export interface ConversionTask {
  id: string;
  type: ConversionType;
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress: number;
  statusStep?: number;
  error?: string;
  
  // Results
  resultData?: {
    projectId: string;
    convertedNotes: any;
    timeSignature: string;
    detectedTempo: number;
    musicXML: string;
    qualityScores: any;
    rawNoteEvents: any[];
  };
  resultMusicXML?: string;
  
  // Inputs
  inputUri: string;
  inputFileName: string;
}

interface ConversionContextProps {
  activeConversions: Record<string, ConversionTask>;
  startAudioTranscription: (
    recordingURI: string,
    fileName: string,
    monophonic: boolean,
    duration: number,
    seconds: number,
    audioSize: number,
    nativeAudioFile: any,
    BACKEND_URL: string
  ) => Promise<string>;
  startSheetScan: (
    croppedImageUri: string,
    imageTitle: string,
    cropTop: number,
    cropBottom: number,
    cropLeft: number,
    cropRight: number,
    BACKEND_URL: string
  ) => Promise<string>;
  clearConversion: (id: string) => void;
  cancelConversion: (id: string) => void;
}

const ConversionContext = createContext<ConversionContextProps | undefined>(undefined);

export function useConversion() {
  const context = useContext(ConversionContext);
  if (!context) {
    throw new Error('useConversion must be used within a ConversionProvider');
  }
  return context;
}

const activeCancellationSources: Record<string, {
  abort?: () => void;
  intervalId?: any;
  cancelled?: boolean;
}> = {};

export const ConversionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeConversions, setConversions] = useState<Record<string, ConversionTask>>({});

  const clearConversion = (id: string) => {
    setConversions(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const cancelConversion = (id: string) => {
    console.log(`[BG] Cancelling conversion task ${id}`);
    if (activeCancellationSources[id]) {
      activeCancellationSources[id].cancelled = true;
      if (activeCancellationSources[id].abort) {
        try {
          activeCancellationSources[id].abort();
        } catch (e) {
          console.warn('[BG] Error calling abort:', e);
        }
      }
      if (activeCancellationSources[id].intervalId) {
        clearInterval(activeCancellationSources[id].intervalId);
      }
      delete activeCancellationSources[id];
    }
    clearConversion(id);
  };

  const startAudioTranscription = async (
    recordingURI: string,
    fileName: string,
    monophonic: boolean,
    duration: number,
    seconds: number,
    audioSize: number,
    nativeAudioFile: any,
    BACKEND_URL: string
  ): Promise<string> => {
    const taskId = 'transcription_' + Date.now();
    
    const newTask: ConversionTask = {
      id: taskId,
      type: 'transcription',
      status: 'running',
      progress: 0,
      statusStep: 0,
      inputUri: recordingURI,
      inputFileName: fileName,
    };
    
    setConversions(prev => ({ ...prev, [taskId]: newTask }));

    // Async background worker
    (async () => {
      let serverTaskId = '';
      try {
        let uploadResult: any;
        const cleanName = fileName.replace(/\.[^/.]+$/, "").replace(/[_\s]+/g, " ");

        let mimeType = 'audio/mpeg';
        if (fileName.toLowerCase().endsWith('.wav')) {
          mimeType = 'audio/wav';
        } else if (fileName.toLowerCase().endsWith('.m4a')) {
          mimeType = 'audio/mp4';
        }

        if (Platform.OS === 'web') {
          const formData = new FormData();
          const audioResponse = await fetch(recordingURI);
          const audioBlob = await audioResponse.blob();
          formData.append('audio', audioBlob, fileName);
          formData.append('monophonic', String(monophonic));
          formData.append('duration', String(duration || seconds || 0));

          console.log('[BG Audio] Sending request (Web)...');
          const controller = new AbortController();
          activeCancellationSources[taskId] = {
            abort: () => {
              controller.abort();
              activeCancellationSources[taskId].cancelled = true;
            }
          };
          const response = await fetch(`${BACKEND_URL}/analyze/start`, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });

          if (response.status !== 200) {
            throw new Error(`Server returned status: ${response.status}`);
          }
          uploadResult = await response.json();
        } else {
          // Native platforms (Android/iOS): use raw XMLHttpRequest
          const fileURI = nativeAudioFile ? nativeAudioFile.uri : recordingURI;
          console.log('[BG Audio Native Debug] Uploading via XHR:', fileURI);

          uploadResult = await new Promise<any>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            activeCancellationSources[taskId] = {
              abort: () => {
                xhr.abort();
                activeCancellationSources[taskId].cancelled = true;
              }
            };
            xhr.open('POST', `${BACKEND_URL}/analyze/start`);

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const responseData = JSON.parse(xhr.responseText);
                  resolve(responseData);
                } catch (e) {
                  reject(new Error(`Failed to parse response: ${xhr.responseText}`));
                }
              } else {
                reject(new Error(`Server returned status: ${xhr.status}`));
              }
            };

            xhr.onerror = () => reject(new Error('Network request failed'));

            const nativeFormData = new FormData();
            nativeFormData.append('audio', {
              uri: fileURI,
              type: mimeType,
              name: fileName,
            } as any);
            nativeFormData.append('monophonic', String(monophonic));
            nativeFormData.append('duration', String(duration || seconds || 0));

            xhr.send(nativeFormData);
          });
        }

        if (activeCancellationSources[taskId]?.cancelled) {
          console.log(`[BG Audio] Task ${taskId} cancelled post-upload. Aborting.`);
          return;
        }

        if (!uploadResult.success || !uploadResult.task_id) {
          throw new Error(uploadResult.error || 'Failed to start transcription task.');
        }

        serverTaskId = uploadResult.task_id;
        console.log(`[BG Audio] Async transcription task started. Server Task ID: ${serverTaskId}`);

        // Start polling status
        let elapsedSeconds = 0;
        
        const poll = async () => {
          try {
            if (activeCancellationSources[taskId]?.cancelled) {
              return true; // Stop polling
            }
            const statusRes = await fetch(`${BACKEND_URL}/analyze/status/${serverTaskId}`);
            const statusJson = await statusRes.json();

            if (statusJson.success) {
              console.log(`[BG Audio] Polling status: ${statusJson.status}, stage: ${statusJson.stage}`);
              
              if (statusJson.status === 'completed') {
                const data = statusJson.result;
                if (data.success && Array.isArray(data.notes) && data.notes.length > 0) {
                  const newProjectId = data.project_id || `local_${Date.now()}`;
                  
                  let persistedAudioURI = recordingURI;
                  let audioDataUrl: string | undefined = undefined;

                  if (Platform.OS === 'web') {
                    try {
                      const resp = await fetch(recordingURI);
                      const blob = await resp.blob();
                      audioDataUrl = await new Promise<string>((resolve2, reject2) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve2(reader.result as string);
                        reader.onerror = reject2;
                        reader.readAsDataURL(blob);
                      });
                      persistedAudioURI = audioDataUrl;
                    } catch (err) {
                      console.warn('[BG Audio] Failed to persist web audio:', err);
                    }
                  } else {
                    try {
                      const audioDir = `${FileSystem.documentDirectory}audio/`;
                      const audioDirInfo = await FileSystem.getInfoAsync(audioDir);
                      if (!audioDirInfo.exists) {
                        await FileSystem.makeDirectoryAsync(audioDir, { intermediates: true });
                      }
                      const ext = recordingURI.split('.').pop()?.split('?')[0] || 'm4a';
                      const persistedPath = `${audioDir}${newProjectId}.${ext}`;
                      await FileSystem.copyAsync({ from: recordingURI, to: persistedPath });
                      persistedAudioURI = persistedPath;
                    } catch (err) {
                      console.warn('[BG Audio] Failed to copy native audio:', err);
                    }
                  }

                  const rawScores = data.quality_scores || data.qualityScores;
                  let scoresObj = null;
                  if (rawScores) {
                    const overall = rawScores.overall_score !== undefined ? rawScores.overall_score : rawScores.overallScore;
                    if (overall !== undefined) {
                      scoresObj = {
                        pitch_accuracy: rawScores.pitch_accuracy !== undefined ? rawScores.pitch_accuracy : rawScores.pitchAccuracy,
                        rhythm_accuracy: rawScores.rhythm_accuracy !== undefined ? rawScores.rhythm_accuracy : rawScores.rhythmAccuracy,
                        tempo_accuracy: rawScores.tempo_accuracy !== undefined ? rawScores.tempo_accuracy : rawScores.tempoAccuracy,
                        chroma_similarity: rawScores.chroma_similarity !== undefined ? rawScores.chroma_similarity : rawScores.chromaSimilarity,
                        overall_score: overall,
                        best_tempo: rawScores.best_tempo !== undefined ? rawScores.best_tempo : rawScores.bestTempo,
                        best_gap_threshold: rawScores.best_gap_threshold !== undefined ? rawScores.best_gap_threshold : rawScores.bestGapThreshold,
                        best_grid_resolution: rawScores.best_grid_resolution !== undefined ? rawScores.best_grid_resolution : rawScores.bestGridResolution,
                      };
                    }
                  }

                  let notesToStore;
                  if (data.treble_notes && data.bass_notes) {
                    notesToStore = {
                      treble: data.treble_notes,
                      bass: data.bass_notes,
                      playback: data.notes
                    };
                  } else {
                    notesToStore = data.notes;
                  }

                  const projectData = {
                    id: newProjectId,
                    name: cleanName,
                    date: new Date().toISOString(),
                    recordingURI: persistedAudioURI,
                    convertedNotes: notesToStore,
                    rawNoteEvents: data.raw_note_events || [],
                    musicXML: data.musicxml || '',
                    timeSignature: data.time_signature || '4/4',
                    detectedTempo: data.detected_tempo || 120,
                    qualityScores: scoresObj,
                    duration: duration || seconds || 0,
                    audioSize: audioSize,
                    sourceType: 'transcribed',
                  };

                  if (Platform.OS === 'web') {
                    localStorage.setItem('melo_project_' + newProjectId, JSON.stringify(projectData));
                  } else {
                    const projectsDir = `${FileSystem.documentDirectory}projects/`;
                    const dirInfo = await FileSystem.getInfoAsync(projectsDir);
                    if (!dirInfo.exists) {
                      await FileSystem.makeDirectoryAsync(projectsDir, { intermediates: true });
                    }
                    const projectFileUri = `${projectsDir}${newProjectId}.json`;
                    await FileSystem.writeAsStringAsync(projectFileUri, JSON.stringify(projectData));
                  }

                  if (activeCancellationSources[taskId]?.cancelled) {
                    console.log(`[BG Audio] Task ${taskId} cancelled before completion logic. Aborting.`);
                    return true;
                  }

                  // Trigger Notification
                  sendLocalNotification("Audio transcription completed.", "Your music sheet is ready.", { projectId: newProjectId });

                  // Update State
                  setConversions(prev => ({
                    ...prev,
                    [taskId]: {
                      ...prev[taskId],
                      status: 'completed',
                      progress: 100,
                      statusStep: 4,
                      resultData: {
                        projectId: newProjectId,
                        convertedNotes: notesToStore,
                        timeSignature: data.time_signature || '4/4',
                        detectedTempo: data.detected_tempo || 120,
                        musicXML: data.musicxml || '',
                        qualityScores: scoresObj,
                        rawNoteEvents: data.raw_note_events || [],
                      }
                    }
                  }));
                } else {
                  throw new Error('No notes detected');
                }
                return true; // Done polling
              } else if (statusJson.status === 'failed') {
                const errMsg = statusJson.error || 'Transcription processing failed.';
                if (activeCancellationSources[taskId]?.cancelled) return true;
                sendLocalNotification("Audio transcription failed.", "Please try again.");
                setConversions(prev => ({
                  ...prev,
                  [taskId]: {
                    ...prev[taskId],
                    status: 'failed',
                    error: errMsg,
                  }
                }));
                return true; // Done polling
              } else {
                // Update transcription progress step
                const stage = statusJson.stage;
                let step = 0;
                if (stage === 'receiving') step = 0;
                else if (stage === 'preprocessing') step = 1;
                else if (stage === 'transcribing') step = 2;
                else if (stage === 'generating_xml') step = 3;
                else if (stage === 'finalizing') step = 4;

                if (activeCancellationSources[taskId]?.cancelled) return true;
                setConversions(prev => ({
                  ...prev,
                  [taskId]: {
                    ...prev[taskId],
                    statusStep: step,
                    progress: step * 25,
                  }
                }));
              }
            } else {
              const errMsg = statusJson.error || statusJson.message || 'Transcription status check failed.';
              if (activeCancellationSources[taskId]?.cancelled) return true;
              sendLocalNotification("Audio transcription failed.", "Please try again.");
              setConversions(prev => ({
                ...prev,
                [taskId]: {
                  ...prev[taskId],
                  status: 'failed',
                  error: errMsg,
                }
              }));
              return true; // Stop polling
            }
          } catch (pollErr) {
            console.warn('[BG Audio] Polling loop status error:', pollErr);
          }
          return false; // Continue polling
        };

        const intervalId = setInterval(async () => {
          if (activeCancellationSources[taskId]?.cancelled) {
            clearInterval(intervalId);
            return;
          }
          elapsedSeconds += 2;
          const isDone = await poll();
          if (isDone) {
            clearInterval(intervalId);
          }
        }, 2000);

        activeCancellationSources[taskId] = {
          abort: () => {
            activeCancellationSources[taskId].cancelled = true;
            clearInterval(intervalId);
          },
          intervalId,
        };

      } catch (err: any) {
        if (activeCancellationSources[taskId]?.cancelled) {
          console.log(`[BG Audio] Task ${taskId} was cancelled. Ignoring error.`);
          return;
        }
        console.error('[BG Audio] Transcription background error:', err);
        sendLocalNotification("Audio transcription failed.", "Please try again.");
        setConversions(prev => ({
          ...prev,
          [taskId]: {
            ...prev[taskId],
            status: 'failed',
            error: err.message || 'Transcription failed',
          }
        }));
      } finally {
        if (activeCancellationSources[taskId] && !activeCancellationSources[taskId].intervalId) {
          delete activeCancellationSources[taskId];
        }
      }
    })();

    return taskId;
  };

  const startSheetScan = async (
    croppedImageUri: string,
    imageTitle: string,
    cropTop: number,
    cropBottom: number,
    cropLeft: number,
    cropRight: number,
    BACKEND_URL: string
  ): Promise<string> => {
    const taskId = 'scan_' + Date.now();

    const newTask: ConversionTask = {
      id: taskId,
      type: 'scan',
      status: 'running',
      progress: 0,
      statusStep: 0,
      inputUri: croppedImageUri,
      inputFileName: imageTitle,
    };

    setConversions(prev => ({ ...prev, [taskId]: newTask }));

    (async () => {
      let finalCropUri = croppedImageUri;
      try {
        // Crop the image
        if (cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0) {
          console.log('[BG Scan] Cropping image before upload...');
          const imageInfo = await ImageManipulator.manipulateAsync(croppedImageUri, []);
          const originX = Math.round((cropLeft / 100) * imageInfo.width);
          const originY = Math.round((cropTop / 100) * imageInfo.height);
          const width = Math.round(((100 - cropLeft - cropRight) / 100) * imageInfo.width);
          const height = Math.round(((100 - cropTop - cropBottom) / 100) * imageInfo.height);
          
          const cropRegion = {
            originX: Math.max(0, originX),
            originY: Math.max(0, originY),
            width: Math.min(imageInfo.width - originX, Math.max(1, width)),
            height: Math.min(imageInfo.height - originY, Math.max(1, height))
          };

          const cropResult = await ImageManipulator.manipulateAsync(
            croppedImageUri,
            [{ crop: cropRegion }],
            { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
          );
          finalCropUri = cropResult.uri;
        }

        console.log(`[BG Scan] Uploading cropped file to: ${BACKEND_URL}/scan/start`);
        
        activeCancellationSources[taskId] = {
          abort: () => {
            activeCancellationSources[taskId].cancelled = true;
          }
        };

        const response = await FileSystem.uploadAsync(`${BACKEND_URL}/scan/start`, finalCropUri, {
          fieldName: 'image',
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          headers: {
            'Accept': 'application/json',
          },
          parameters: {
            'name': imageTitle,
          },
        });

        if (activeCancellationSources[taskId]?.cancelled) {
          console.log(`[BG Scan] Task ${taskId} cancelled post-upload. Aborting.`);
          return;
        }

        if (response.status !== 200) {
          throw new Error(`Server returned status ${response.status}: ${response.body}`);
        }

        const json = JSON.parse(response.body);
        if (!json.success || !json.task_id) {
          throw new Error(json.error || json.message || 'Failed to start OMR scanning task.');
        }

        const omrTaskId = json.task_id;
        console.log(`[BG Scan] Async scanning task started. Task ID: ${omrTaskId}`);

        // Start Polling Loop
        let elapsedSeconds = 0;
        
        const poll = async () => {
          try {
            if (activeCancellationSources[taskId]?.cancelled) {
              return true; // Stop polling
            }
            const statusRes = await fetch(`${BACKEND_URL}/scan/status/${omrTaskId}`);
            const statusJson = await statusRes.json();

            if (statusJson.success) {
              console.log(`[BG Scan] Polling status: ${statusJson.status}, stage: ${statusJson.stage}`);
              
              if (statusJson.status === 'completed') {
                const xml = statusJson.musicxml;
                const hasNotes = xml.includes('<note');
                if (!hasNotes) {
                  if (activeCancellationSources[taskId]?.cancelled) return true;
                  sendLocalNotification("Sheet scan failed.", "Please scan the sheet again.");
                  setConversions(prev => ({
                    ...prev,
                    [taskId]: {
                      ...prev[taskId],
                      status: 'failed',
                      error: 'No musical notes were detected in the sheet image.',
                    }
                  }));
                  return true; // Stop polling
                }

                if (activeCancellationSources[taskId]?.cancelled) return true;
                // Success!
                sendLocalNotification("Sheet scan completed.", "Your digitized sheet is ready.");

                // Persist latest scan conversion to local storage
                saveLatestConversion('scan', {
                  croppedImageUri: finalCropUri,
                  imageTitle,
                  musicxml: xml,
                  showSheet: true,
                });

                setConversions(prev => ({
                  ...prev,
                  [taskId]: {
                    ...prev[taskId],
                    status: 'completed',
                    progress: 100,
                    statusStep: 4,
                    resultMusicXML: xml,
                    inputUri: finalCropUri
                  }
                }));
                return true; // Done polling
              } else if (statusJson.status === 'failed') {
                const errMsg = statusJson.error || 'OMR processing failed.';
                if (activeCancellationSources[taskId]?.cancelled) return true;
                sendLocalNotification("Sheet scan failed.", "Please scan the sheet again.");
                setConversions(prev => ({
                  ...prev,
                  [taskId]: {
                    ...prev[taskId],
                    status: 'failed',
                    error: errMsg,
                  }
                }));
                return true; // Stop polling
              } else {
                // Update OMR progress step
                const stage = statusJson.stage;
                let step = 0;
                if (stage === 'preparing') step = 0;
                else if (stage === 'detecting_staffs') step = 1;
                else if (stage === 'recognizing_symbols') step = 2;
                else if (stage === 'generating_xml') step = 3;

                if (activeCancellationSources[taskId]?.cancelled) return true;
                setConversions(prev => ({
                  ...prev,
                  [taskId]: {
                    ...prev[taskId],
                    statusStep: step,
                    progress: step * 25,
                  }
                }));
              }
            } else {
              const errMsg = statusJson.error || statusJson.message || 'OMR status check failed.';
              if (activeCancellationSources[taskId]?.cancelled) return true;
              sendLocalNotification("Sheet scan failed.", "Please scan the sheet again.");
              setConversions(prev => ({
                ...prev,
                [taskId]: {
                  ...prev[taskId],
                  status: 'failed',
                  error: errMsg,
                }
              }));
              return true; // Stop polling
            }
          } catch (pollErr) {
            console.warn('[BG Scan] Polling loop status error:', pollErr);
          }
          return false; // Continue polling
        };

        const intervalId = setInterval(async () => {
          if (activeCancellationSources[taskId]?.cancelled) {
            clearInterval(intervalId);
            return;
          }
          elapsedSeconds += 2;
          const isDone = await poll();
          if (isDone) {
            clearInterval(intervalId);
          }
        }, 2000);

        activeCancellationSources[taskId] = {
          abort: () => {
            activeCancellationSources[taskId].cancelled = true;
            clearInterval(intervalId);
          },
          intervalId,
        };

      } catch (err: any) {
        if (activeCancellationSources[taskId]?.cancelled) {
          console.log(`[BG Scan] Task ${taskId} was cancelled. Ignoring error.`);
          return;
        }
        console.error('[BG Scan] Scan background error:', err);
        sendLocalNotification("Sheet scan failed.", "Please scan the sheet again.");
        setConversions(prev => ({
          ...prev,
          [taskId]: {
            ...prev[taskId],
            status: 'failed',
            error: err.message || 'OMR scanning failed',
          }
        }));
      } finally {
        if (activeCancellationSources[taskId]) {
          delete activeCancellationSources[taskId];
        }
      }
    })();

    return taskId;
  };

  return (
    <ConversionContext.Provider value={{ activeConversions, startAudioTranscription, startSheetScan, clearConversion, cancelConversion }}>
      {children}
    </ConversionContext.Provider>
  );
};
