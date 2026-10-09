import { ref } from 'vue';
export type PreviewState = 'ready' | 'loading' | 'empty' | 'error';
export function usePreviewState() {
  const state = ref<PreviewState>('ready');
  const changeState = (value: PreviewState) => { state.value = value; };
  const retry = () => changeState('ready');
  return { state, changeState, retry };
}
