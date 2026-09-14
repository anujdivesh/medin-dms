import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertCircle, Loader2, ListChecks } from "lucide-react";
import { apiService } from '@/lib/apiClient';
import { API_ENDPOINTS } from '@/config/apiEndpoints';

/**
 * RequestMultipleDataButton
 * Props:
 * - items: Array<{ id: number|string, title?: string }>
 * - onSubmitted?: (resultSummary) => void // called after submission
 * - variant/size/className: passthrough to Button
 */
const RequestMultipleDataButton = ({ items = [], onSubmitted, variant = "default", size = "sm", className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    requester_name: '',
    requester_email: '',
    reason: ''
  });
  const [errors, setErrors] = useState({});

  const ids = useMemo(() => items.map(i => i.id), [items]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.requester_name.trim()) newErrors.requester_name = 'Name is required';
    if (!formData.requester_email.trim()) newErrors.requester_email = 'Email is required';
    else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.requester_email)) newErrors.requester_email = 'Please enter a valid email address';
    }
    if (!formData.reason.trim()) newErrors.reason = 'Reason is required';
    else if (formData.reason.trim().length < 10) newErrors.reason = 'Reason must be at least 10 characters long';
    else if (formData.reason.trim().length > 2000) newErrors.reason = 'Reason must not exceed 2000 characters';
    if (!ids || ids.length === 0) newErrors.items = 'No items selected';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Please fix the form errors before submitting');
      return;
    }
    setIsSubmitting(true);
    try {
      const payloads = ids.map(id => ({
        metadata_id: id,
        requester_name: formData.requester_name.trim(),
        requester_email: formData.requester_email.trim(),
        reason: formData.reason.trim()
      }));

      const results = await Promise.allSettled(payloads.map(body => (
        apiService.request(API_ENDPOINTS.DATA_REQUESTS.CREATE, {
          method: 'POST',
          body: JSON.stringify(body)
        }).then(async resp => ({ ok: resp.ok, data: await resp.json() }))
      )));

      const summary = results.reduce((acc, r, idx) => {
        if (r.status === 'fulfilled' && r.value.ok && r.value.data?.status === 'success') {
          acc.success.push(ids[idx]);
        } else {
          acc.failed.push({ id: ids[idx], error: r.reason || r.value?.data?.detail || r.value });
        }
        return acc;
      }, { success: [], failed: [] });

      if (summary.failed.length === 0) {
        toast.success(`Submitted ${summary.success.length} request${summary.success.length !== 1 ? 's' : ''} successfully.`);
      } else if (summary.success.length > 0) {
        toast.warning(`Submitted ${summary.success.length} successfully, ${summary.failed.length} failed.`);
      } else {
        toast.error(`All ${summary.failed.length} submissions failed.`);
      }

      setIsOpen(false);
      setFormData({ requester_name: '', requester_email: '', reason: '' });
      setErrors({});
      onSubmitted?.(summary);
    } catch (err) {
      console.error('Bulk request submit error:', err);
      toast.error('Failed to submit requests. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = formData.requester_name.trim() && formData.requester_email.trim() && formData.reason.trim() && (!errors || Object.keys(errors).length === 0);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant={variant}
        size={size}
        className={className}
        disabled={!items || items.length === 0}
      >
        <ListChecks className="h-4 w-4 mr-2" />
        Request Selected ({items?.length || 0})
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!isSubmitting) setIsOpen(open) }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">📋 Request Data for {items?.length || 0} item{items?.length === 1 ? '' : 's'}</DialogTitle>
            <p className="text-sm text-gray-600">One request will be submitted for each selected dataset using the same details.</p>
          </DialogHeader>

          {errors.items && (
            <div className="text-red-600 text-sm mb-2 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {errors.items}
            </div>
          )}

          {/* List of selected items */}
          <div className="max-h-36 overflow-auto mb-3 rounded border border-border bg-muted/30 p-2">
            {items && items.length > 0 ? (
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                {items.map((it) => (
                  <li key={it.id}><span className="text-foreground font-medium">{it.title || it.id}</span></li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-muted-foreground">No items selected.</div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="requester_name">Your Full Name *</Label>
              <Input id="requester_name" name="requester_name" value={formData.requester_name} onChange={handleInputChange} required disabled={isSubmitting} className={errors.requester_name ? 'border-red-500' : ''} />
              {errors.requester_name && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-4 w-4" />{errors.requester_name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="requester_email">Your Email Address *</Label>
              <Input id="requester_email" name="requester_email" type="email" value={formData.requester_email} onChange={handleInputChange} required disabled={isSubmitting} className={errors.requester_email ? 'border-red-500' : ''} />
              {errors.requester_email && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-4 w-4" />{errors.requester_email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Request *</Label>
              <Textarea id="reason" name="reason" rows={4} value={formData.reason} onChange={handleInputChange} placeholder="Explain why you need access and how you'll use it" required disabled={isSubmitting} className={errors.reason ? 'border-red-500' : ''} />
              <div className="flex justify-between items-center">
                {errors.reason && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-4 w-4" />{errors.reason}</p>}
                <p className={`text-sm ${formData.reason.length > 2000 ? 'text-red-600' : 'text-gray-500'} ml-auto`}>{formData.reason.length}/2000</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => !isSubmitting && setIsOpen(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || !isFormValid} className="min-w-[150px]">
                {isSubmitting ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting...</>) : 'Submit Requests'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RequestMultipleDataButton;
