// @vitest-environment happy-dom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {PostingRhythms} from '../../web/app/studio/rhythms/PostingRhythms';
import * as api from '../../web/lib/posting-rhythms-api';
vi.mock('@/lib/studio-session-context',()=>({useStudioSession:()=>({creatorId:'creator_a'})}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()}),useSearchParams:()=>new URLSearchParams()}));
vi.mock('../../web/app/studio/rhythms/RhythmActionReview',()=>({RhythmActionReview:()=>null}));
vi.mock('../../web/lib/posting-rhythms-api',async importOriginal=>({...await importOriginal<typeof api>(),loadRhythms:vi.fn(),loadRhythmRuns:vi.fn(),saveRhythm:vi.fn(),saveRhythmDraft:vi.fn(),setRhythmStatus:vi.fn(),confirmRhythm:vi.fn()}));
const boot:api.RhythmBootstrap={source:{id:'patreon_campaign_a',label:'Artist account'},templates:[],rhythms:[],drafts:[],posts:[],coach:false,emailAvailable:false};
async function ready(){render(<PostingRhythms/>);await screen.findByText('Also send it to…');}
beforeEach(()=>{sessionStorage.clear();vi.mocked(api.loadRhythms).mockResolvedValue(structuredClone(boot));vi.mocked(api.loadRhythmRuns).mockResolvedValue({enrollments:[]});});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('Posting Rhythms app integration',()=>{
 it('uses the real source and never renders a fictional account',async()=>{await ready();expect((screen.getByLabelText('Trigger account') as HTMLSelectElement).value).toBe('patreon_campaign_a');expect(screen.queryByText(/moonstudio/)).toBeNull();expect(screen.getByText('Posting Rhythms')).toBeTruthy();});
 it('connects an explicitly confirmed extension account and sends the complete configuration to the server',async()=>{await ready();fireEvent.click(screen.getByLabelText('Connect X'));fireEvent.change(screen.getByLabelText('Account handle'),{target:{value:'artist'}});fireEvent.click(screen.getByText('Use account'));fireEvent.click(screen.getAllByText('Save rhythm')[0]);fireEvent.change(screen.getByLabelText('Rhythm name'),{target:{value:'My rhythm'}});vi.mocked(api.saveRhythm).mockImplementation(async config=>({rhythm:{id:'rhythm_a',version:1,name:config.name,config,status:'active',isDefault:false,alwaysOn:false,armed:false}}));fireEvent.click(screen.getAllByText('Save rhythm').find(e=>e.closest('[aria-label="Save this rhythm"]'))!);await waitFor(()=>expect(api.saveRhythm).toHaveBeenCalled());const payload=vi.mocked(api.saveRhythm).mock.calls[0][0];expect(payload.source).toBe(boot.source!.id);expect(payload.accounts.x).toBe('artist');expect(payload.routes[0].destinations).toEqual(['x']);expect(payload.alwaysOn).toBe(false);expect(api.confirmRhythm).not.toHaveBeenCalled();});
 it('shows preview and unavailable platforms without creating jobs or pretending to connect',async()=>{await ready();fireEvent.click(screen.getByRole('button',{name:'Preview rhythm'}));await waitFor(()=>expect(document.querySelector('dialog[open]')).toBeTruthy());expect(screen.getByText('Mock artwork · no posts are sent')).toBeTruthy();fireEvent.click(screen.getByLabelText('Close Preview rhythm'));fireEvent.click(screen.getByLabelText('Connect Instagram'));expect(screen.getByText('Instagram image routing is not available yet.')).toBeTruthy();expect(screen.queryByText('Use account')).toBeNull();expect(api.saveRhythm).not.toHaveBeenCalled();});
 it('asks before archiving and does not mutate on cancellation',async()=>{
  const cfg=api.newRhythm('patreon_campaign_a');cfg.name='Saved rhythm';
  vi.mocked(api.loadRhythms).mockResolvedValue({...boot,rhythms:[{id:'saved',name:cfg.name,version:1,status:'active',config:cfg,isDefault:false,alwaysOn:false,armed:false}]});
  await ready();fireEvent.click(screen.getByRole('button',{name:'Rhythms',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Archive',exact:true}));
  expect(screen.getByText('Unstarted releases will be cancelled. Publication history is kept.')).toBeTruthy();
  expect(api.setRhythmStatus).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));expect(api.setRhythmStatus).not.toHaveBeenCalled();
 });

});
