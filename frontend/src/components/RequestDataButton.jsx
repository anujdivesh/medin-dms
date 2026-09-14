import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { apiService } from '@/lib/apiClient';
import { API_ENDPOINTS } from '@/config/apiEndpoints';

const RequestDataButton = ({ metadataId, title = "Request Data Access" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        requester_name: '',
        requester_email: '',
        reason: ''
    });
    const [errors, setErrors] = useState({});

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    const validateForm = () => {
        const newErrors = {};

        // Name validation
        if (!formData.requester_name.trim()) {
            newErrors.requester_name = 'Name is required';
        } else if (formData.requester_name.trim().length < 2) {
            newErrors.requester_name = 'Name must be at least 2 characters long';
        }

        // Email validation
        if (!formData.requester_email.trim()) {
            newErrors.requester_email = 'Email is required';
        } else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(formData.requester_email)) {
                newErrors.requester_email = 'Please enter a valid email address';
            }
        }

        // Reason validation
        if (!formData.reason.trim()) {
            newErrors.reason = 'Reason is required';
        } else if (formData.reason.trim().length < 10) {
            newErrors.reason = 'Reason must be at least 10 characters long';
        } else if (formData.reason.trim().length > 2000) {
            newErrors.reason = 'Reason must not exceed 2000 characters';
        }

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
            const requestData = {
                metadata_id: metadataId,
                requester_name: formData.requester_name.trim(),
                requester_email: formData.requester_email.trim(),
                reason: formData.reason.trim()
            };

            const response = await apiService.request(API_ENDPOINTS.DATA_REQUESTS.CREATE, {
                method: 'POST',
                body: JSON.stringify(requestData)
            });

            const data = await response.json();

            if (response.ok && data.status === 'success') {
                toast.success('Data request submitted successfully! You will be contacted regarding your request.');

                // Reset form and close modal
                setFormData({ requester_name: '', requester_email: '', reason: '' });
                setErrors({});
                setIsOpen(false);
            } else {
                // Handle validation errors from backend
                if (data.detail && typeof data.detail === 'object' && data.detail.message) {
                    toast.error(data.detail.message);
                } else {
                    toast.error(data.msg || data.detail || 'Failed to submit request');
                }
            }
        } catch (error) {
            console.error('Error submitting data request:', error);
            toast.error('Failed to submit request. Please check your connection and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            setIsOpen(false);
            setFormData({ requester_name: '', requester_email: '', reason: '' });
            setErrors({});
        }
    };

    const isFormValid = formData.requester_name.trim() &&
        formData.requester_email.trim() &&
        formData.reason.trim() &&
        Object.keys(errors).length === 0;

    return (
        <>
            {/* <Button
                onClick={() => setIsOpen(true)}
                variant="outline"
                size="sm"
                className="bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-600 text-xs"
            >
                📋 Request Data
            </Button> */}

            <Dialog open={isOpen} onOpenChange={handleClose}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            📋 {title}
                        </DialogTitle>
                        <p className="text-sm text-gray-600">
                            Submit a request to access this dataset. Please provide detailed information about your intended use.
                        </p>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="requester_name" className="text-sm font-medium">
                                Your Full Name *
                            </Label>
                            <Input
                                id="requester_name"
                                name="requester_name"
                                type="text"
                                value={formData.requester_name}
                                onChange={handleInputChange}
                                placeholder="Enter your full name"
                                required
                                disabled={isSubmitting}
                                className={errors.requester_name ? 'border-red-500 focus:border-red-500' : ''}
                            />
                            {errors.requester_name && (
                                <p className="text-sm text-red-600 flex items-center gap-1">
                                    <AlertCircle className="h-4 w-4" />
                                    {errors.requester_name}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="requester_email" className="text-sm font-medium">
                                Your Email Address *
                            </Label>
                            <Input
                                id="requester_email"
                                name="requester_email"
                                type="email"
                                value={formData.requester_email}
                                onChange={handleInputChange}
                                placeholder="Enter your email address"
                                required
                                disabled={isSubmitting}
                                className={errors.requester_email ? 'border-red-500 focus:border-red-500' : ''}
                            />
                            {errors.requester_email && (
                                <p className="text-sm text-red-600 flex items-center gap-1">
                                    <AlertCircle className="h-4 w-4" />
                                    {errors.requester_email}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="reason" className="text-sm font-medium">
                                Reason for Request *
                            </Label>
                            <Textarea
                                id="reason"
                                name="reason"
                                value={formData.reason}
                                onChange={handleInputChange}
                                placeholder="Please explain why you need access to this data and how you plan to use it. Include details about your research, project, or organization."
                                rows={4}
                                required
                                disabled={isSubmitting}
                                className={errors.reason ? 'border-red-500 focus:border-red-500' : ''}
                            />
                            <div className="flex justify-between items-center">
                                {errors.reason && (
                                    <p className="text-sm text-red-600 flex items-center gap-1">
                                        <AlertCircle className="h-4 w-4" />
                                        {errors.reason}
                                    </p>
                                )}
                                <p className={`text-sm ${formData.reason.length > 2000 ? 'text-red-600' : 'text-gray-500'} ml-auto`}>
                                    {formData.reason.length}/2000
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end space-x-2 pt-4 border-t">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleClose}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmitting || !isFormValid}
                                className="bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 min-w-[120px]"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Submitting...
                                    </>
                                ) : (
                                    'Submit Request'
                                )}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default RequestDataButton;