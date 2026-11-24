// 最小姿态驱动（仅取证用，不提交）：向 iOS 模拟器内部投递 Device Hub 的 vendor-defined HID 事件。
//   hinge <degrees>      摆铰链角（0=闭合 / 180=全展开）
//   orient <value>       摆朝向（portrait / landscape-left / landscape-right / pud）
//
// 协议（usagePage 0xFF61 / usage 0x5B / payload provider+source+type+value）来自
// artemnovichkov/hinge（MIT）：https://github.com/artemnovichkov/hinge
// 这里只取「发事件」最小实现；状态回读交给探针（UIScreen / safeArea / reservedRegion）与 devicectl。

#import <Foundation/Foundation.h>
#include <CoreFoundation/CoreFoundation.h>
#include <mach/mach_time.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

typedef struct __IOHIDEvent *IOHIDEventRef;
typedef struct __IOHIDEventSystemClient *IOHIDEventSystemClientRef;

extern IOHIDEventRef IOHIDEventCreateVendorDefinedEvent(CFAllocatorRef allocator, uint64_t timeStamp,
    uint32_t usagePage, uint32_t usage, uint32_t version, const uint8_t *data, CFIndex length, uint32_t options);
extern IOHIDEventSystemClientRef IOHIDEventSystemClientCreateWithType(CFAllocatorRef allocator, int type,
    CFDictionaryRef properties);
extern void IOHIDEventSystemClientDispatchEvent(IOHIDEventSystemClientRef client, IOHIDEventRef event);
extern CFDataRef IOCFSerialize(CFTypeRef object, CFOptionFlags options);

enum { kUsagePage = 0xFF61, kUsage = 0x5B, kClientTypeSimple = 4, kSerializeBinary = 1 };

static const char *kProvider = "com.apple.Virtualization.VirtualMachines";

static int send_payload(IOHIDEventSystemClientRef client, const char *source, const char *type, CFTypeRef value) {
  const void *keys[] = {CFSTR("provider"), CFSTR("source"), CFSTR("type"), CFSTR("value")};
  const void *values[] = {NULL, NULL, NULL, value};
  CFStringRef provider = CFStringCreateWithCString(NULL, kProvider, kCFStringEncodingUTF8);
  CFStringRef src = CFStringCreateWithCString(NULL, source, kCFStringEncodingUTF8);
  CFStringRef typ = CFStringCreateWithCString(NULL, type, kCFStringEncodingUTF8);
  values[0] = provider;
  values[1] = src;
  values[2] = typ;
  CFDictionaryRef payload = CFDictionaryCreate(NULL, keys, values, 4,
      &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  CFDataRef data = IOCFSerialize(payload, kSerializeBinary);
  if (!data) {
    fprintf(stderr, "duo-pose: failed to serialize payload\n");
    return 1;
  }
  IOHIDEventRef event = IOHIDEventCreateVendorDefinedEvent(NULL, mach_absolute_time(), kUsagePage, kUsage, 0,
      CFDataGetBytePtr(data), CFDataGetLength(data), 0);
  if (!event) {
    fprintf(stderr, "duo-pose: failed to create event\n");
    return 1;
  }
  IOHIDEventSystemClientDispatchEvent(client, event);
  return 0;
}

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: duo-pose hinge <degrees 0-180> | duo-pose orient <portrait|landscape-left|landscape-right|pud>\n");
    return 64;
  }
  IOHIDEventSystemClientRef client = IOHIDEventSystemClientCreateWithType(NULL, kClientTypeSimple, NULL);
  if (!client) {
    fprintf(stderr, "duo-pose: failed to create HID event system client\n");
    return 1;
  }

  int rc = 0;
  if (strcmp(argv[1], "hinge") == 0) {
    double degrees = atof(argv[2]);
    if (degrees < 0) degrees = 0;
    if (degrees > 180) degrees = 180;
    CFNumberRef value = CFNumberCreate(NULL, kCFNumberDoubleType, &degrees);
    rc = send_payload(client, "hinge-slider-control", "range", value);
    printf("sent hinge %.1f\n", degrees);
  } else if (strcmp(argv[1], "orient") == 0) {
    CFStringRef value = CFStringCreateWithCString(NULL, argv[2], kCFStringEncodingUTF8);
    rc = send_payload(client, "orientation-picker-control", "enum", value);
    printf("sent orient %s\n", argv[2]);
  } else {
    fprintf(stderr, "duo-pose: unknown command %s\n", argv[1]);
    return 64;
  }
  fflush(stdout);
  usleep(50000);
  return rc;
}