import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const todayStr = () => new Date().toISOString().split('T')[0];

export function useTasks(walletAddress) {
  const [tasks, setTasks] = useState([]);
  const [completedIds, setCompletedIds] = useState([]);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    const date = todayStr();
    const wallet = walletAddress.toLowerCase();

    const { data: taskData } = await supabase
      .from('tasks')
      .select('*')
      .eq('active', true)
      .eq('task_date', date);

    const { data: completions } = await supabase
      .from('completions')
      .select('task_id')
      .eq('wallet_address', wallet)
      .eq('claim_date', date);

    const { data: claim } = await supabase
      .from('claims')
      .select('id')
      .eq('wallet_address', wallet)
      .eq('claim_date', date)
      .maybeSingle();

    setTasks(taskData || []);
    setCompletedIds((completions || []).map(c => c.task_id));
    setAlreadyClaimed(!!claim);
    setLoading(false);
  }, [walletAddress]);

  useEffect(() => { load(); }, [load]);

  const markDone = async (taskId) => {
    await supabase.from('completions').upsert({
      wallet_address: walletAddress.toLowerCase(),
      task_id: taskId,
      claim_date: todayStr(),
    }, { onConflict: 'wallet_address,task_id,claim_date' });
    load();
  };

  const allDone = tasks.length > 0 && tasks.every(t => completedIds.includes(t.id));

  const recordClaim = async () => {
    await supabase.from('claims').insert({
      wallet_address: walletAddress.toLowerCase(),
      claim_date: todayStr(),
    });
    load();
  };

  return { tasks, completedIds, allDone, alreadyClaimed, markDone, recordClaim, loading, reload: load };
}