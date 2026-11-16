"""Own a Windows native converter and all of its child processes."""
import ctypes
from ctypes import wintypes
import os


class BasicLimits(ctypes.Structure):
    _fields_=[('process_time',ctypes.c_longlong),('job_time',ctypes.c_longlong),
              ('flags',wintypes.DWORD),('minimum_working_set',ctypes.c_size_t),
              ('maximum_working_set',ctypes.c_size_t),('active_processes',wintypes.DWORD),
              ('affinity',ctypes.c_size_t),('priority',wintypes.DWORD),('scheduling',wintypes.DWORD)]


class IoCounters(ctypes.Structure):
    _fields_=[(name,ctypes.c_ulonglong) for name in ('read_ops','write_ops','other_ops','read_bytes','write_bytes','other_bytes')]


class ExtendedLimits(ctypes.Structure):
    _fields_=[('basic',BasicLimits),('io',IoCounters),('process_memory',ctypes.c_size_t),
              ('job_memory',ctypes.c_size_t),('peak_process_memory',ctypes.c_size_t),('peak_job_memory',ctypes.c_size_t)]


class NativeJob:
    def __init__(self, worker):
        self.handle=None
        if os.name!='nt':return
        self.api=ctypes.WinDLL('kernel32',use_last_error=True)
        self.api.CreateJobObjectW.argtypes=[ctypes.c_void_p,wintypes.LPCWSTR]
        self.api.CreateJobObjectW.restype=wintypes.HANDLE
        self.api.AssignProcessToJobObject.argtypes=[wintypes.HANDLE,wintypes.HANDLE]
        self.api.AssignProcessToJobObject.restype=wintypes.BOOL
        self.api.SetInformationJobObject.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD]
        self.api.SetInformationJobObject.restype=wintypes.BOOL
        self.api.TerminateJobObject.argtypes=[wintypes.HANDLE,wintypes.UINT]
        self.api.TerminateJobObject.restype=wintypes.BOOL
        self.api.CloseHandle.argtypes=[wintypes.HANDLE]
        self.api.CloseHandle.restype=wintypes.BOOL
        self.handle=self.api.CreateJobObjectW(None,None)
        limits=ExtendedLimits();limits.basic.flags=0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if (not self.handle or
            not self.api.SetInformationJobObject(self.handle,9,ctypes.byref(limits),ctypes.sizeof(limits)) or
            not self.api.AssignProcessToJobObject(self.handle,wintypes.HANDLE(int(worker._handle)))):
            error=ctypes.get_last_error()
            if self.handle:self.api.CloseHandle(self.handle)
            self.handle=None
            worker.kill()
            worker.communicate()
            raise ValueError(f'Windows could not isolate the converter process (error {error}).')

    def terminate(self):
        if self.handle:
            if not self.api.TerminateJobObject(self.handle,1):
                raise OSError(ctypes.get_last_error(),'Unable to stop the local converter job')

    def close(self):
        if self.handle:
            self.api.TerminateJobObject(self.handle,0)
            self.api.CloseHandle(self.handle)
            self.handle=None
